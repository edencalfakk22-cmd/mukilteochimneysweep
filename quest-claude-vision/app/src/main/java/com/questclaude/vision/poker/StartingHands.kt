package com.questclaude.vision.poker

/**
 * The 169 kinds of Hold'em starting hands ("AA", "AKs", "AKo"...) and opponent ranges built
 * from them.
 */
object StartingHands {

    /** Name of the starting hand made by two cards, e.g. "AKs" (suited), "T9o" (offsuit), "77". */
    fun nameOf(first: Int, second: Int): String {
        val high = maxOf(Cards.rank(first), Cards.rank(second))
        val low = minOf(Cards.rank(first), Cards.rank(second))
        val ranks = "${Cards.RANKS[high]}${Cards.RANKS[low]}"
        return when {
            high == low -> ranks
            Cards.suit(first) == Cards.suit(second) -> ranks + "s"
            else -> ranks + "o"
        }
    }

    /** How many two-card combinations a starting hand has: 6 for pairs, 4 suited, 12 offsuit. */
    fun combos(name: String): Int = when {
        name.length == 2 -> 6
        name.endsWith("s") -> 4
        else -> 12
    }

    /** All 169 starting hands, in no particular order. */
    fun all(): List<String> = buildList {
        for (high in 12 downTo 0) {
            for (low in high downTo 0) {
                val ranks = "${Cards.RANKS[high]}${Cards.RANKS[low]}"
                if (high == low) add(ranks) else {
                    add(ranks + "s")
                    add(ranks + "o")
                }
            }
        }
    }

    /**
     * All 169 starting hands from strongest to weakest, ranked by all-in equity against one
     * random hand (computed with [EquityCalculator], 200,000 runouts per hand).
     */
    val RANKING: List<String> = RANKING_TEXT.trim().split(Regex("\\s+"))

    /**
     * The strongest starting hands that together make up [fraction] of all 1,326 two-card
     * combinations, e.g. 0.15 for a tight player who only continues with the top 15%.
     * Returned as a 52x52 lookup: `range[a * 52 + b]` is true when cards a and b form such a hand.
     */
    fun topRange(fraction: Double): BooleanArray {
        require(fraction > 0.0 && fraction <= 1.0) { "fraction must be in (0, 1]" }
        val target = fraction * TOTAL_COMBOS
        val included = HashSet<String>()
        var count = 0
        for (name in RANKING) {
            if (count >= target) break
            included += name
            count += combos(name)
        }
        val range = BooleanArray(52 * 52)
        for (a in 0 until 52) {
            for (b in 0 until 52) {
                if (a != b && nameOf(a, b) in included) range[a * 52 + b] = true
            }
        }
        return range
    }

    const val TOTAL_COMBOS = 1326
}

private const val RANKING_TEXT = """
AA KK QQ JJ TT 99 88 AKs 77 AQs AJs AKo ATs
AQo AJo KQs 66 A9s ATo KJs A8s KTs KQo A7s KJo A9o
55 QJs A5s K9s A8o KTo A6s QTs A4s A7o QJo K8s A3s
K9o A6o A5o JTs Q9s QTo K7s A2s 44 A4o K6s K8o Q8s
A3o K5s Q9o J9s JTo K7o K4s A2o Q7s K3s J8s K6o T9s
33 Q6s Q8o J9o K5o K2s Q5s K4o T8s J7s Q7o Q4s K3o
T9o J8o Q6o Q3s 98s T7s K2o 22 J6s Q2s Q5o T8o J5s
J7o J4s Q4o 97s T6s Q3o 98o J3s T7o 87s J6o 96s J5o
J2s Q2o T5s T4s 97o 86s T6o J4o 95s T3s 76s J3o 87o
T2s J2o 96o 85s T5o 94s 75s T4o 93s 65s 86o 84s 95o
T3o 92s 76o 74s T2o 54s 85o 64s 83s 94o 75o 82s 65o
93o 73s 53s 63s 84o 92o 74o 43s 54o 72s 64o 52s 62s
83o 42s 82o 73o 53o 32s 63o 43o 72o 52o 62o 42o 32o
"""
