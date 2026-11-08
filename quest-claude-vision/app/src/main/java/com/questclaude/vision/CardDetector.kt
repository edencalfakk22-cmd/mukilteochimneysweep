package com.questclaude.vision

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.graphics.Bitmap
import com.questclaude.vision.poker.CardModel
import java.nio.FloatBuffer

/** Runs the playing-card model on the headset with ONNX Runtime. Fully offline. */
class CardDetector(context: Context) : AutoCloseable {
    private val env = OrtEnvironment.getEnvironment()
    private val session: OrtSession
    private val classToCard: IntArray

    init {
        val model = try {
            context.assets.open(MODEL_ASSET).use { it.readBytes() }
        } catch (e: java.io.IOException) {
            throw IllegalStateException("קובץ המודל חסר. בנה את האפליקציה מחדש כשהמחשב מחובר לאינטרנט (ראה README).", e)
        }
        val options = OrtSession.SessionOptions().apply { setIntraOpNumThreads(4) }
        session = env.createSession(model, options)
        val names = session.metadata.customMetadata["names"]
            ?: throw IllegalStateException("למודל אין רשימת קלפים (names)")
        classToCard = CardModel.parseClassNames(names)
    }

    /** Blocking (a few hundred ms) - call from a background thread. */
    fun detect(frame: Bitmap): List<CardModel.Detection> {
        val pixels = IntArray(frame.width * frame.height)
        frame.getPixels(pixels, 0, frame.width, 0, 0, frame.width, frame.height)
        val input = CardModel.preprocess(pixels, frame.width, frame.height)
        val shape = longArrayOf(1, 3, CardModel.INPUT_SIZE.toLong(), CardModel.INPUT_SIZE.toLong())
        OnnxTensor.createTensor(env, FloatBuffer.wrap(input.chw), shape).use { tensor ->
            session.run(mapOf(session.inputNames.first() to tensor)).use { result ->
                val buffer = (result.get(0) as OnnxTensor).floatBuffer
                val output = FloatArray(buffer.remaining()).also { buffer.get(it) }
                return CardModel.decode(output, classToCard, input)
            }
        }
    }

    override fun close() {
        session.close()
    }

    private companion object {
        const val MODEL_ASSET = "cards.onnx"
    }
}
