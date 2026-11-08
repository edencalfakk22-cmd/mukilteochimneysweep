package com.questclaude.vision.poker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HandEvaluatorTest {

    private fun score(vararg codes: String): Int =
        HandEvaluator.evaluate(codes.map { requireNotNull(Cards.parse(it)) { it } }.toIntArray())

    private fun category(vararg codes: String) = HandCategory.of(score(*codes))

    @Test
    fun recognisesEveryCategory() {
        assertEquals(HandCategory.STRAIGHT_FLUSH, category("As", "Ks", "Qs", "Js", "Ts", "2c", "3d"))
        assertEquals(HandCategory.QUADS, category("9h", "9d", "9c", "9s", "Kd", "2c", "3d"))
        assertEquals(HandCategory.FULL_HOUSE, category("Kh", "Kd", "Kc", "7s", "7h", "2c", "3d"))
        assertEquals(HandCategory.FLUSH, category("Ah", "9h", "6h", "4h", "2h", "Kc", "Qd"))
        assertEquals(HandCategory.STRAIGHT, category("9c", "8d", "7h", "6s", "5c", "Ad", "Ah"))
        assertEquals(HandCategory.TRIPS, category("Qc", "Qd", "Qh", "8s", "5c", "3d", "2h"))
        assertEquals(HandCategory.TWO_PAIR, category("Jc", "Jd", "4h", "4s", "Ac", "8d", "2h"))
        assertEquals(HandCategory.PAIR, category("Tc", "Td", "Ah", "8s", "5c", "3d", "2h"))
        assertEquals(HandCategory.HIGH_CARD, category("Ac", "Jd", "9h", "7s", "5c", "3d", "2h"))
    }

    @Test
    fun wheelIsTheLowestStraight() {
        val wheel = score("Ah", "2d", "3c", "4s", "5h", "9c", "Kd")
        val sixHigh = score("2d", "3c", "4s", "5h", "6h", "9c", "Kd")
        assertEquals(HandCategory.STRAIGHT, HandCategory.of(wheel))
        assertTrue(sixHigh > wheel)
    }

    @Test
    fun twoTripsMakeAFullHouseWithTheHigherTrips() {
        val kingsFull = score("Kh", "Kd", "Kc", "7s", "7h", "7d", "2c")
        val queensFullOfAces = score("Qh", "Qd", "Qc", "As", "Ah", "2d", "3c")
        assertEquals(HandCategory.FULL_HOUSE, HandCategory.of(kingsFull))
        assertTrue(kingsFull > queensFullOfAces)
    }

    @Test
    fun thirdPairCanBeTheKicker() {
        val queenKicker = score("As", "Ad", "Ks", "Kd", "Qh", "Qd", "2c")
        val threeKicker = score("Ah", "Ac", "Kh", "Kc", "3h", "3d", "2d")
        assertTrue(queenKicker > threeKicker)
    }

    @Test
    fun kickersBreakTies() {
        assertTrue(score("Ah", "Ad", "Kc", "8s", "5c", "3d", "2h") > score("As", "Ac", "Qc", "8d", "5h", "3s", "2d"))
        assertTrue(score("9h", "9d", "9c", "9s", "Ad", "2c", "3d") > score("9h", "9d", "9c", "9s", "Kd", "2c", "3d"))
        // Same best five cards, different unused cards: a split pot.
        assertEquals(score("As", "Ks", "Qs", "Js", "9s", "2c", "3d"), score("As", "Ks", "Qs", "Js", "9s", "4c", "5d"))
    }

    @Test
    fun flushUsesTheBestFiveSuitedCards() {
        assertTrue(score("Ah", "Kh", "9h", "6h", "4h", "2h", "Qd") > score("Ah", "Kh", "9h", "6h", "3h", "2h", "Qd"))
    }

    @Test
    fun worksWithFiveAndSixCards() {
        assertEquals(HandCategory.PAIR, category("Ah", "Ad", "9c", "7s", "2h"))
        assertEquals(HandCategory.STRAIGHT, category("Th", "Jd", "Qc", "Ks", "Ah", "2c"))
    }
}
