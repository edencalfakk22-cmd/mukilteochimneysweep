package com.questclaude.vision.poker

object HandCategory {
    const val HIGH_CARD = 0
    const val PAIR = 1
    const val TWO_PAIR = 2
    const val TRIPS = 3
    const val STRAIGHT = 4
    const val FLUSH = 5
    const val FULL_HOUSE = 6
    const val QUADS = 7
    const val STRAIGHT_FLUSH = 8
    const val COUNT = 9

    val HEBREW_NAMES = listOf(
        "קלף גבוה", "זוג", "שני זוגות", "שלישייה", "רצף",
        "צבע (פלאש)", "פול האוס", "רביעייה", "רצף בצבע",
    )

    fun of(score: Int): Int = score shr 20
}

/**
 * Texas Hold'em hand evaluator. [evaluate] returns a score for the best five-card hand within
 * 5 to 7 cards: a higher score wins, equal scores split the pot. The hand category sits in the
 * bits above 20, followed by five 4-bit rank slots (primary ranks, then kickers).
 */
object HandEvaluator {

    fun evaluate(cards: IntArray, count: Int = cards.size): Int {
        require(count in 5..7) { "Need 5 to 7 cards, got $count" }
        val rankCounts = IntArray(13)
        val suitCounts = IntArray(4)
        val suitMasks = IntArray(4)
        var rankMask = 0
        for (i in 0 until count) {
            val rank = cards[i] shr 2
            val suit = cards[i] and 3
            rankCounts[rank]++
            suitCounts[suit]++
            suitMasks[suit] = suitMasks[suit] or (1 shl rank)
            rankMask = rankMask or (1 shl rank)
        }

        // With at most 7 cards a flush cannot coexist with quads or a full house, so it is safe
        // to settle flushes first.
        for (suit in 0 until 4) {
            if (suitCounts[suit] >= 5) {
                val high = straightHigh(suitMasks[suit])
                return if (high >= 0) {
                    score(HandCategory.STRAIGHT_FLUSH, high)
                } else {
                    score(HandCategory.FLUSH, kickerMask = suitMasks[suit], kickers = 5)
                }
            }
        }

        var quads = -1
        var trips = -1
        var secondTrips = -1
        var pair = -1
        var secondPair = -1
        for (rank in 12 downTo 0) {
            when (rankCounts[rank]) {
                4 -> quads = rank
                3 -> if (trips < 0) trips = rank else if (secondTrips < 0) secondTrips = rank
                2 -> if (pair < 0) pair = rank else if (secondPair < 0) secondPair = rank
            }
        }

        if (quads >= 0) {
            return score(HandCategory.QUADS, quads, kickerMask = rankMask without quads, kickers = 1)
        }
        if (trips >= 0 && (secondTrips >= 0 || pair >= 0)) {
            return score(HandCategory.FULL_HOUSE, trips, maxOf(secondTrips, pair))
        }
        val straight = straightHigh(rankMask)
        if (straight >= 0) return score(HandCategory.STRAIGHT, straight)
        if (trips >= 0) {
            return score(HandCategory.TRIPS, trips, kickerMask = rankMask without trips, kickers = 2)
        }
        if (pair >= 0 && secondPair >= 0) {
            // A third pair (possible with 7 cards) can still serve as the kicker.
            val kickers = (rankMask without pair) without secondPair
            return score(HandCategory.TWO_PAIR, pair, secondPair, kickerMask = kickers, kickers = 1)
        }
        if (pair >= 0) {
            return score(HandCategory.PAIR, pair, kickerMask = rankMask without pair, kickers = 3)
        }
        return score(HandCategory.HIGH_CARD, kickerMask = rankMask, kickers = 5)
    }

    /** Highest card of a five-in-a-row inside [mask], 3 for the A-2-3-4-5 wheel, or -1. */
    private fun straightHigh(mask: Int): Int {
        for (high in 12 downTo 4) {
            val run = 0b11111 shl (high - 4)
            if ((mask and run) == run) return high
        }
        val wheel = (1 shl 12) or 0b1111
        return if ((mask and wheel) == wheel) 3 else -1
    }

    private infix fun Int.without(rank: Int): Int = this and (1 shl rank).inv()

    private fun score(
        category: Int,
        first: Int = -1,
        second: Int = -1,
        kickerMask: Int = 0,
        kickers: Int = 0,
    ): Int {
        var score = category
        var slots = 0
        for (rank in intArrayOf(first, second)) {
            if (rank >= 0) {
                score = score * 16 + rank
                slots++
            }
        }
        var mask = kickerMask
        repeat(kickers) {
            val high = if (mask == 0) 0 else 31 - Integer.numberOfLeadingZeros(mask)
            mask = mask without high
            score = score * 16 + high
            slots++
        }
        while (slots < 5) {
            score *= 16
            slots++
        }
        return score
    }
}
