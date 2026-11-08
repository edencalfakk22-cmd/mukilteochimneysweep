package com.questclaude.vision.poker

import kotlin.random.Random

class EquityResult(
    val iterations: Int,
    val opponents: Int,
    /** Share of runouts where you beat every opponent. */
    val win: Double,
    /** Share of runouts where you tie for the best hand. */
    val tie: Double,
    /** Your expected share of the pot: wins plus your part of split pots. */
    val equity: Double,
    /** Probability of finishing the hand (after the river) in each [HandCategory]. */
    val finalCategoryOdds: DoubleArray,
)

/**
 * Monte Carlo equity for Texas Hold'em against [opponents] random hands: deals the unknown
 * cards many times and counts how often your hand wins or ties. With 40,000 runs the result is
 * within about half a percentage point of the exact value.
 */
object EquityCalculator {

    fun calculate(
        hole: List<Int>,
        board: List<Int>,
        opponents: Int,
        iterations: Int = 40_000,
        random: Random = Random.Default,
    ): EquityResult {
        require(hole.size == 2) { "Need exactly 2 hole cards" }
        require(board.size <= 5) { "The board has at most 5 cards" }
        require(opponents in 1..9) { "Opponents must be between 1 and 9" }
        val known = hole + board
        require(known.all { it in 0 until 52 } && known.toSet().size == known.size) { "Duplicate or invalid card" }

        val deck = (0 until 52).filterNot { it in known }.toIntArray()
        val boardMissing = 5 - board.size
        val cardsToDeal = boardMissing + 2 * opponents

        val fullBoard = IntArray(5)
        board.forEachIndexed { i, card -> fullBoard[i] = card }
        val hero = IntArray(7)
        hero[0] = hole[0]
        hero[1] = hole[1]
        val villain = IntArray(7)

        var wins = 0
        var ties = 0
        var splitShare = 0.0
        val categoryCounts = IntArray(HandCategory.COUNT)

        repeat(iterations) {
            // Partial Fisher-Yates: the first [cardsToDeal] deck slots become a fresh random deal.
            for (i in 0 until cardsToDeal) {
                val j = i + random.nextInt(deck.size - i)
                val tmp = deck[i]
                deck[i] = deck[j]
                deck[j] = tmp
            }
            for (i in 0 until boardMissing) fullBoard[board.size + i] = deck[i]
            for (i in 0 until 5) {
                hero[2 + i] = fullBoard[i]
                villain[2 + i] = fullBoard[i]
            }

            val heroScore = HandEvaluator.evaluate(hero)
            categoryCounts[HandCategory.of(heroScore)]++

            var lost = false
            var tiedWith = 0
            for (o in 0 until opponents) {
                villain[0] = deck[boardMissing + 2 * o]
                villain[1] = deck[boardMissing + 2 * o + 1]
                val score = HandEvaluator.evaluate(villain)
                if (score > heroScore) {
                    lost = true
                    break
                }
                if (score == heroScore) tiedWith++
            }
            if (!lost) {
                if (tiedWith == 0) {
                    wins++
                } else {
                    ties++
                    splitShare += 1.0 / (tiedWith + 1)
                }
            }
        }

        val n = iterations.toDouble()
        return EquityResult(
            iterations = iterations,
            opponents = opponents,
            win = wins / n,
            tie = ties / n,
            equity = (wins + splitShare) / n,
            finalCategoryOdds = DoubleArray(HandCategory.COUNT) { categoryCounts[it] / n },
        )
    }

    /**
     * Pot odds: the share of the final pot you have to put in to call. Calling is profitable
     * in the long run when your equity is higher than this.
     */
    fun potOdds(pot: Double, toCall: Double): Double? =
        if (pot < 0 || toCall <= 0) null else toCall / (pot + toCall)
}
