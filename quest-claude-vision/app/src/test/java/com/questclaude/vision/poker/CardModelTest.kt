package com.questclaude.vision.poker

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class CardModelTest {

    private fun card(code: String) = requireNotNull(Cards.parse(code)) { code }

    /** The class list exactly as Ultralytics stores it in the model's metadata. */
    private val modelNames = "{0: '10C', 1: '10D', 2: '10H', 3: '10S', 4: '2C', 5: '2D', 6: '2H', 7: '2S', " +
        "8: '3C', 9: '3D', 10: '3H', 11: '3S', 12: '4C', 13: '4D', 14: '4H', 15: '4S', 16: '5C', 17: '5D', " +
        "18: '5H', 19: '5S', 20: '6C', 21: '6D', 22: '6H', 23: '6S', 24: '7C', 25: '7D', 26: '7H', 27: '7S', " +
        "28: '8C', 29: '8D', 30: '8H', 31: '8S', 32: '9C', 33: '9D', 34: '9H', 35: '9S', 36: 'AC', 37: 'AD', " +
        "38: 'AH', 39: 'AS', 40: 'JC', 41: 'JD', 42: 'JH', 43: 'JS', 44: 'KC', 45: 'KD', 46: 'KH', 47: 'KS', " +
        "48: 'QC', 49: 'QD', 50: 'QH', 51: 'QS'}"

    @Test
    fun parsesModelClassNames() {
        val classes = CardModel.parseClassNames(modelNames)
        assertEquals(52, classes.toSet().size)
        assertEquals(card("Tc"), classes[0])
        assertEquals(card("Ah"), classes[38])
        assertEquals(card("Qs"), classes[51])
    }

    /** Builds a fake [1, 56, anchors] output from (box, class, score) triples. */
    private fun fakeOutput(vararg anchors: Triple<FloatArray, Int, Float>): FloatArray {
        val n = anchors.size
        val out = FloatArray((4 + CardModel.NUM_CLASSES) * n)
        anchors.forEachIndexed { a, (box, cls, score) ->
            for (i in 0 until 4) out[i * n + a] = box[i]
            out[(4 + cls) * n + a] = score
        }
        return out
    }

    @Test
    fun decodeMapsBoxesBackAndRemovesDuplicates() {
        val classes = CardModel.parseClassNames(modelNames)
        // A 1280x960 frame: scale 0.5, padded 80 px at the top and bottom.
        val input = CardModel.Letterboxed(FloatArray(0), scale = 0.5f, padX = 0f, padY = 80f)
        val output = fakeOutput(
            Triple(floatArrayOf(100f, 180f, 20f, 40f), 38, 0.9f), // A♥ corner
            Triple(floatArrayOf(101f, 181f, 20f, 40f), 38, 0.8f), // same corner again -> NMS
            Triple(floatArrayOf(100f, 180f, 20f, 40f), 47, 0.7f), // K♠ on the same spot: different card, kept
            Triple(floatArrayOf(400f, 300f, 20f, 40f), 0, 0.3f), // below the threshold
        )

        val detections = CardModel.decode(output, classes, input)

        assertEquals(listOf(card("Ah"), card("Ks")), detections.map { it.card })
        val ace = detections.first()
        assertEquals(180f, ace.left, 1e-3f) // (100 - 10) / 0.5
        assertEquals(160f, ace.top, 1e-3f) // (180 - 20 - 80) / 0.5
        assertEquals(220f, ace.right, 1e-3f) // (100 + 10) / 0.5
        assertEquals(240f, ace.bottom, 1e-3f) // (180 + 20 - 80) / 0.5
    }

    private fun det(code: String, confidence: Float, x: Float = 0f) =
        CardModel.Detection(card(code), confidence, x, 0f, x + 10f, 10f)

    @Test
    fun voteKeepsCardsSeenInEnoughFrames() {
        val frames = listOf(
            listOf(det("Ah", 0.9f), det("Ah", 0.7f), det("4d", 0.6f)),
            listOf(det("Ah", 0.95f), det("Ks", 0.8f)),
            listOf(det("Ks", 0.85f)),
        )

        val seen = CardModel.vote(frames, minFrames = 2)

        // 4♦ appeared once (a misread), A♥ twice in frame 1 counts as one frame.
        assertEquals(listOf(card("Ah"), card("Ks")), seen.map { it.card })
        assertEquals(0.95f, seen.first().confidence, 0f)
    }

    @Test
    fun preprocessLetterboxesAndNormalises() {
        // 4x2 image: left half pure red, right half pure blue.
        val red = 0xFFFF0000.toInt()
        val blue = 0xFF0000FF.toInt()
        val pixels = intArrayOf(red, red, blue, blue, red, red, blue, blue)

        val input = CardModel.preprocess(pixels, width = 4, height = 2)

        assertEquals(160f, input.scale, 0f)
        assertEquals(0f, input.padX, 0f)
        assertEquals(160f, input.padY, 0f)
        val plane = CardModel.INPUT_SIZE * CardModel.INPUT_SIZE
        fun rgbAt(x: Int, y: Int) = floatArrayOf(
            input.chw[y * CardModel.INPUT_SIZE + x],
            input.chw[plane + y * CardModel.INPUT_SIZE + x],
            input.chw[2 * plane + y * CardModel.INPUT_SIZE + x],
        )
        val grey = 114f / 255f
        assertArrayEquals(floatArrayOf(grey, grey, grey), rgbAt(320, 10), 1e-6f) // padding
        assertArrayEquals(floatArrayOf(1f, 0f, 0f), rgbAt(10, 320), 1e-6f) // red side
        assertArrayEquals(floatArrayOf(0f, 0f, 1f), rgbAt(630, 320), 1e-6f) // blue side
    }
}
