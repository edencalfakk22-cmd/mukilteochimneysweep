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
 * Monte Carlo equity for Texas Hold'em: deals the unknown cards many times and counts how often
 * your hand wins or ties. With 40,000 runs the result is within about half a percentage point of
 * the exact value.
 */
object EquityCalculator {

    /** Give up on a range after this many clashes with cards already dealt to other opponents. */
    private const val MAX_RANGE_ATTEMPTS = 200

    /**
     * @param opponentRange which two-card hands opponents may hold, as built by
     *   [StartingHands.topRange]; null means any hand (random opponents).
     */
    fun calculate(
        hole: List<Int>,
        board: List<Int>,
        opponents: Int,
        iterations: Int = 40_000,
        random: Random = Random.Default,
        opponentRange: BooleanArray? = null,
    ): EquityResult {
        require(hole.size == 2) { "Need exactly 2 hole cards" }
        require(board.size <= 5) { "The board has at most 5 cards" }
        require(opponents in 1..9) { "Opponents must be between 1 and 9" }
        require(opponentRange == null || opponentRange.size == 52 * 52) { "Range must be a 52x52 table" }
        val known = hole + board
        require(known.all { it in 0 until 52 } && known.toSet().size == known.size) { "Duplicate or invalid card" }

        val deck = (0 until 52).filterNot { it in known }.toIntArray()
        val position = IntArray(52) { -1 }
        deck.forEachIndexed { i, card -> position[card] = i }
        fun swap(i: Int, j: Int) {
            val a = deck[i]
            val b = deck[j]
            deck[i] = b
            deck[j] = a
            position[b] = i
            position[a] = j
        }
        /** Partial Fisher-Yates step: moves a random card from the undealt pool into slot [i]. */
        fun drawInto(i: Int) = swap(i, i + random.nextInt(deck.size - i))

        // Hands the range allows that don't use a card you can see, encoded low * 52 + high.
        // Picking straight from this list stays fast even for a range of a single hand.
        val rangeCombos: IntArray? = opponentRange?.let { range ->
            val combos = ArrayList<Int>()
            for (a in 0 until 52) {
                for (b in a + 1 until 52) {
                    if (range[a * 52 + b] && position[a] >= 0 && position[b] >= 0) combos += a * 52 + b
                }
            }
            combos.toIntArray()
        }?.takeIf { it.isNotEmpty() }
        val boardMissing = 5 - board.size

        val fullBoard = IntArray(5)
        board.forEachIndexed { i, card -> fullBoard[i] = card }
        val opponentCards = IntArray(2 * opponents)
        val hero = IntArray(7)
        hero[0] = hole[0]
        hero[1] = hole[1]
        val villain = IntArray(7)

        var wins = 0
        var ties = 0
        var splitShare = 0.0
        val categoryCounts = IntArray(HandCategory.COUNT)

        repeat(iterations) {
            // Deck slots before `next` are dealt this run; the rest is the undealt pool.
            var next = 0

            // Opponents first, so their hands depend only on the cards you can see. Dealing the
            // board first and then filtering hands by range would skew which boards come up.
            for (o in 0 until opponents) {
                var combo = -1
                if (rangeCombos != null) {
                    // Pick a hand from the range whose cards are still undealt this run.
                    var attempts = 0
                    while (combo < 0 && attempts++ < MAX_RANGE_ATTEMPTS) {
                        val candidate = rangeCombos[random.nextInt(rangeCombos.size)]
                        if (position[candidate / 52] >= next && position[candidate % 52] >= next) combo = candidate
                    }
                }
                if (combo >= 0) {
                    swap(next, position[combo / 52])
                    swap(next + 1, position[combo % 52])
                } else {
                    // No range, or every hand in it is already taken: deal any two cards.
                    drawInto(next)
                    drawInto(next + 1)
                }
                opponentCards[2 * o] = deck[next]
                opponentCards[2 * o + 1] = deck[next + 1]
                next += 2
            }
            for (i in 0 until boardMissing) {
                drawInto(next)
                fullBoard[board.size + i] = deck[next]
                next++
            }
            for (i in 0 until 5) {
                hero[2 + i] = fullBoard[i]
                villain[2 + i] = fullBoard[i]
            }

            val heroScore = HandEvaluator.evaluate(hero)
            categoryCounts[HandCategory.of(heroScore)]++

            var lost = false
            var tiedWith = 0
            for (o in 0 until opponents) {
                villain[0] = opponentCards[2 * o]
                villain[1] = opponentCards[2 * o + 1]
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
