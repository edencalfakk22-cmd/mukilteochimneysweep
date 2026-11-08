package com.questclaude.vision.poker

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StartingHandsTest {

    private fun card(code: String) = requireNotNull(Cards.parse(code)) { code }

    @Test
    fun rankingCoversEveryStartingHandOnce() {
        assertEquals(169, StartingHands.RANKING.size)
        assertEquals(StartingHands.all().toSet(), StartingHands.RANKING.toSet())
        assertEquals(StartingHands.TOTAL_COMBOS, StartingHands.RANKING.sumOf { StartingHands.combos(it) })
        assertEquals("AA", StartingHands.RANKING.first())
        assertEquals("32o", StartingHands.RANKING.last())
    }

    @Test
    fun namesHands() {
        assertEquals("AKs", StartingHands.nameOf(card("Kh"), card("Ah")))
        assertEquals("T9o", StartingHands.nameOf(card("9c"), card("Td")))
        assertEquals("77", StartingHands.nameOf(card("7s"), card("7d")))
    }

    @Test
    fun topRangeHoldsTheStrongestHands() {
        val tight = StartingHands.topRange(0.05)
        assertTrue(tight[card("As") * 52 + card("Ah")])
        assertTrue(tight[card("Ah") * 52 + card("As")])
        assertFalse(tight[card("7c") * 52 + card("2d")])
        // Every combination is in the 100% range.
        val all = StartingHands.topRange(1.0)
        assertEquals(StartingHands.TOTAL_COMBOS * 2, all.count { it })
    }

    @Test
    fun strongOpponentRangesLowerYourEquity() {
        val hole = listOf(card("Ah"), card("Jd"))
        val vsAnything = EquityCalculator.calculate(hole, emptyList(), 1, iterations = 30_000, random = Random(5))
        val vsTight = EquityCalculator.calculate(
            hole, emptyList(), 1, iterations = 30_000, random = Random(5),
            opponentRange = StartingHands.topRange(0.10),
        )
        assertTrue("${vsTight.equity} vs ${vsAnything.equity}", vsTight.equity < vsAnything.equity - 0.15)
    }

    @Test
    fun rangeRespectsCardsYouHold() {
        // The opponent only plays aces; you hold two, so they must hold the other two: a near-certain split.
        val result = EquityCalculator.calculate(
            listOf(card("As"), card("Ah")), emptyList(), 1, iterations = 20_000, random = Random(6),
            opponentRange = StartingHands.topRange(0.001),
        )
        assertTrue("tie ${result.tie}", result.tie > 0.9)
        assertEquals(0.5, result.equity, 0.02)
    }
}
