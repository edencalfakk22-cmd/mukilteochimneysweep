package com.questclaude.vision.poker

/**
 * How selective the opponents still in the hand are: each style keeps the strongest share of
 * starting hands. Someone who stayed in after a big raise is usually [VERY_TIGHT].
 */
enum class OpponentStyle(val label: String, val description: String, val fraction: Double) {
    ANY("כל יד", "ידיים אקראיות", 1.0),
    LOOSE("משחק הרבה", "50% הידיים החזקות", 0.5),
    AVERAGE("ממוצע", "30% הידיים החזקות", 0.3),
    TIGHT("הדוק", "15% הידיים החזקות", 0.15),
    VERY_TIGHT("מהמר חזק", "7% הידיים החזקות", 0.07);

    /** The opponents' possible hands, or null for any hand. Built once per style. */
    val range: BooleanArray? by lazy { if (fraction >= 1.0) null else StartingHands.topRange(fraction) }
}
