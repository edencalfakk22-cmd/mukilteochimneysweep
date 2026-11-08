package com.questclaude.vision.poker

/**
 * Decides where newly seen cards go in automatic mode, following the order of a Hold'em hand:
 * your two hole cards first, then the flop, turn and river. Once the board is complete, two new
 * cards can only be the next deal, so a new hand starts on its own.
 */
object AutoAssign {

    class Update(val hole: List<Int?>, val board: List<Int?>, val newHand: Boolean)

    /**
     * @param stable cards the detector has seen consistently over the last few frames
     * @param ignored cards the user removed by hand; automatic mode leaves them alone
     * @return the new table, or null when nothing changes
     */
    fun next(
        hole: List<Int?>,
        board: List<Int?>,
        stable: List<CardModel.Detection>,
        ignored: Set<Int>,
    ): Update? {
        val known = (hole + board).filterNotNull().toSet()
        val fresh = stable.filter { it.card !in known && it.card !in ignored }
        if (fresh.isEmpty()) return null

        val holeCards = hole.filterNotNull()
        val boardCards = board.filterNotNull()
        return when {
            holeCards.size < 2 -> {
                // Your own cards are the closest to the camera, so their corners look biggest.
                val added = fresh.sortedByDescending { it.area }.take(2 - holeCards.size).map { it.card }
                Update(slots(holeCards + added, 2), board, newHand = false)
            }
            boardCards.size < 5 -> {
                val added = fresh.take(5 - boardCards.size).sortedBy { it.centerX }.map { it.card }
                Update(hole, slots(boardCards + added, 5), newHand = false)
            }
            fresh.size >= 2 -> {
                val newHole = fresh.sortedByDescending { it.area }.take(2).map { it.card }
                Update(slots(newHole, 2), slots(emptyList(), 5), newHand = true)
            }
            else -> null
        }
    }

    private fun slots(cards: List<Int>, size: Int): List<Int?> = List(size) { cards.getOrNull(it) }
}
