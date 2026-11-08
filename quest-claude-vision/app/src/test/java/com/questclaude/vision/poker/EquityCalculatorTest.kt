package com.questclaude.vision.poker

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Test

class EquityCalculatorTest {

    private fun cards(vararg codes: String) = codes.map { requireNotNull(Cards.parse(it)) { it } }

    @Test
    fun royalFlushOnTheBoardAlwaysSplits() {
        val result = EquityCalculator.calculate(
            hole = cards("2c", "3d"),
            board = cards("As", "Ks", "Qs", "Js", "Ts"),
            opponents = 1,
            iterations = 2_000,
            random = Random(1),
        )
        assertEquals(0.0, result.win, 0.0)
        assertEquals(1.0, result.tie, 0.0)
        assertEquals(0.5, result.equity, 1e-9)
    }

    @Test
    fun royalFlushInHandAlwaysWins() {
        val result = EquityCalculator.calculate(
            hole = cards("As", "Ks"),
            board = cards("Qs", "Js", "Ts", "2c", "3d"),
            opponents = 5,
            iterations = 2_000,
            random = Random(2),
        )
        assertEquals(1.0, result.win, 0.0)
        assertEquals(1.0, result.finalCategoryOdds[HandCategory.STRAIGHT_FLUSH], 0.0)
    }

    @Test
    fun pocketAcesVersusOneRandomHandIsAboutEightyFivePercent() {
        // Published exact value: 85.2%.
        val result = EquityCalculator.calculate(
            hole = cards("Ah", "As"),
            board = emptyList(),
            opponents = 1,
            iterations = 60_000,
            random = Random(42),
        )
        assertEquals(0.852, result.equity, 0.01)
    }

    @Test
    fun finalCategoryOddsAddUpToOne() {
        val result = EquityCalculator.calculate(
            hole = cards("7h", "8h"),
            board = cards("9h", "Tc", "2h"),
            opponents = 3,
            iterations = 10_000,
            random = Random(3),
        )
        assertEquals(1.0, result.finalCategoryOdds.sum(), 1e-9)
    }

    @Test
    fun potOdds() {
        assertEquals(0.25, EquityCalculator.potOdds(pot = 300.0, toCall = 100.0)!!, 1e-9)
        assertEquals(null, EquityCalculator.potOdds(pot = 300.0, toCall = 0.0))
    }
}
