package com.questclaude.vision.poker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AutoAssignTest {

    private fun card(code: String) = requireNotNull(Cards.parse(code)) { code }

    /** A detected corner at horizontal position [x] with side length [size]. */
    private fun seen(code: String, x: Float = 0f, size: Float = 10f, confidence: Float = 0.9f) =
        CardModel.Detection(card(code), confidence, x, 0f, x + size, size)

    private fun cards(vararg codes: String?, size: Int) = List(size) { i -> codes.getOrNull(i)?.let { card(it) } }

    private val emptyHole = cards(size = 2)
    private val emptyBoard = cards(size = 5)

    @Test
    fun firstCardsBecomeYourHandPreferringTheClosest() {
        // Three cards in view: the two big (close) ones are yours.
        val update = AutoAssign.next(
            emptyHole, emptyBoard,
            listOf(seen("Ah", size = 40f), seen("7c", size = 8f), seen("Kd", size = 38f)),
            ignored = emptySet(),
        )!!
        assertEquals(cards("Ah", "Kd", size = 2), update.hole)
        assertEquals(emptyBoard, update.board)
        assertFalse(update.newHand)
    }

    @Test
    fun secondHoleCardCanArriveLater() {
        val update = AutoAssign.next(cards("Ah", size = 2), emptyBoard, listOf(seen("Ah"), seen("Kd")), emptySet())!!
        assertEquals(cards("Ah", "Kd", size = 2), update.hole)
    }

    @Test
    fun laterCardsGoToTheBoardLeftToRight() {
        val hole = cards("Ah", "Kd", size = 2)
        val flop = AutoAssign.next(
            hole, emptyBoard,
            listOf(seen("Ah"), seen("9s", x = 300f), seen("2c", x = 100f), seen("Jh", x = 200f)),
            emptySet(),
        )!!
        assertEquals(cards("2c", "Jh", "9s", size = 5), flop.board)

        val turn = AutoAssign.next(hole, flop.board, listOf(seen("2c"), seen("Qd", x = 50f)), emptySet())!!
        assertEquals(cards("2c", "Jh", "9s", "Qd", size = 5), turn.board)
    }

    @Test
    fun knownAndIgnoredCardsChangeNothing() {
        val hole = cards("Ah", "Kd", size = 2)
        assertNull(AutoAssign.next(hole, emptyBoard, listOf(seen("Ah"), seen("Kd")), emptySet()))
        assertNull(AutoAssign.next(hole, emptyBoard, listOf(seen("4d")), ignored = setOf(card("4d"))))
    }

    @Test
    fun twoNewCardsAfterTheRiverStartANewHand() {
        val hole = cards("Ah", "Kd", size = 2)
        val board = cards("2c", "Jh", "9s", "Qd", "3h", size = 5)

        assertNull(AutoAssign.next(hole, board, listOf(seen("8s")), emptySet()))

        val update = AutoAssign.next(hole, board, listOf(seen("8s", size = 30f), seen("8d", size = 32f)), emptySet())!!
        assertTrue(update.newHand)
        assertEquals(cards("8d", "8s", size = 2), update.hole)
        assertEquals(emptyBoard, update.board)
    }
}
