package com.questclaude.vision.poker

/**
 * A card is an Int 0..51: rank * 4 + suit.
 * rank 0 = deuce .. 12 = ace; suit 0..3 = spades, hearts, diamonds, clubs.
 */
object Cards {
    const val RANKS = "23456789TJQKA"
    const val SUITS = "shdc"
    private const val SUIT_SYMBOLS = "♠♥♦♣"

    /** All 52 two-letter codes ("As", "Td", "7c"...), the format Claude is asked to return. */
    val ALL_CODES: List<String> = (0 until 52).map { code(it) }

    fun of(rank: Int, suit: Int): Int = rank * 4 + suit
    fun rank(card: Int): Int = card shr 2
    fun suit(card: Int): Int = card and 3
    fun isRed(card: Int): Boolean = suit(card) == 1 || suit(card) == 2

    fun code(card: Int): String = "${RANKS[rank(card)]}${SUITS[suit(card)]}"

    /** Parses codes like "Ah", "td", "10s". Returns null for anything else. */
    fun parse(text: String): Int? {
        val code = text.trim().replace("10", "T")
        if (code.length != 2) return null
        val rank = RANKS.indexOf(code[0].uppercaseChar())
        val suit = SUITS.indexOf(code[1].lowercaseChar())
        return if (rank < 0 || suit < 0) null else of(rank, suit)
    }

    /** Human label, e.g. "A♠", "10♥". */
    fun label(card: Int): String {
        val rank = RANKS[rank(card)].let { if (it == 'T') "10" else it.toString() }
        return rank + SUIT_SYMBOLS[suit(card)]
    }
}
