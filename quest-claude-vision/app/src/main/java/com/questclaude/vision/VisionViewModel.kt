package com.questclaude.vision

import android.app.Application
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.questclaude.vision.poker.AutoAssign
import com.questclaude.vision.poker.CardModel
import com.questclaude.vision.poker.EquityCalculator
import com.questclaude.vision.poker.EquityResult
import com.questclaude.vision.poker.HandCategory
import com.questclaude.vision.poker.HandEvaluator
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Which cards a scan is meant to capture. */
enum class ScanTarget { HOLE, BOARD }

/** A position on the table: one of your 2 hole cards or one of the 5 board cards. */
data class CardSlot(val target: ScanTarget, val index: Int)

/** Everything the poker screen shows. Card lists have fixed slots; null means "not known yet". */
data class PokerState(
    val cameraReady: Boolean = false,
    /** Scan continuously and fill in cards without pressing anything. */
    val autoMode: Boolean = true,
    val hole: List<Int?> = List(2) { null },
    val board: List<Int?> = List(5) { null },
    val opponents: Int = 1,
    val pot: String = "",
    val toCall: String = "",
    val scanning: ScanTarget? = null,
    val note: String? = null,
    val error: String? = null,
    val result: EquityResult? = null,
    val calculating: Boolean = false,
    val snapshot: ImageBitmap? = null,
    /** What the model found in [snapshot], drawn on top of it. */
    val detections: List<CardModel.Detection> = emptyList(),
) {
    val usedCards: Set<Int> get() = (hole + board).filterNotNull().toSet()

    fun cardAt(slot: CardSlot): Int? =
        if (slot.target == ScanTarget.HOLE) hole[slot.index] else board[slot.index]

    /** What you hold right now, once the flop is out. */
    val currentCategory: Int?
        get() {
            val known = (hole + board).filterNotNull()
            if (hole.any { it == null } || known.size < 5) return null
            return HandCategory.of(HandEvaluator.evaluate(known.toIntArray()))
        }

    val potOdds: Double?
        get() {
            val potValue = pot.toDoubleOrNull() ?: return null
            val callValue = toCall.toDoubleOrNull() ?: return null
            return EquityCalculator.potOdds(potValue, callValue)
        }
}

class VisionViewModel(app: Application) : AndroidViewModel(app) {
    var poker by mutableStateOf(PokerState())
        private set

    private val camera = PassthroughCamera(app)

    @Volatile
    private var loadedDetector: CardDetector? = null

    /** Loading the 45 MB model takes a moment, so it starts right away in the background. */
    private val detector: Deferred<CardDetector> =
        viewModelScope.async(Dispatchers.IO) { CardDetector(app).also { loadedDetector = it } }
    private var calculation: Job? = null

    private var autoLoop: Job? = null
    /** The last few frames' detections; a card has to show up in most of them to count. */
    private val recentFrames = ArrayDeque<List<CardModel.Detection>>()
    /** Cards the user removed or replaced by hand: automatic mode must not bring them back. */
    private val ignoredCards = mutableSetOf<Int>()

    init {
        viewModelScope.launch {
            try {
                detector.await()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                poker = poker.copy(error = e.message ?: "לא הצלחתי לטעון את מודל זיהוי הקלפים")
            }
        }
    }

    // ---- Camera ----

    fun startCamera() {
        viewModelScope.launch {
            try {
                camera.open()
                poker = poker.copy(cameraReady = true)
                if (poker.autoMode) startAutoLoop()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                poker = poker.copy(cameraReady = false, error = e.message ?: "לא הצלחתי להפעיל את המצלמה")
            }
        }
    }

    fun stopCamera() {
        stopAutoLoop()
        camera.close()
        poker = poker.copy(cameraReady = false)
    }

    fun onPermissionDenied() {
        poker = poker.copy(error = "בלי הרשאת מצלמה האפליקציה לא יכולה לראות. אשר את ההרשאות בהגדרות האפליקציה.")
    }

    // ---- Scanning ----

    /**
     * Photographs your hole cards or the board a few times in a row, runs the card model on
     * each frame and keeps the cards that most frames agree on.
     */
    fun scanCards(target: ScanTarget) {
        if (poker.scanning != null || !poker.cameraReady) return
        poker = poker.copy(scanning = target, error = null, note = null)

        viewModelScope.launch {
            try {
                val model = detector.await()
                val frames = ArrayList<List<CardModel.Detection>>()
                var lastFrame: Bitmap? = null
                repeat(SCAN_FRAMES) { i ->
                    if (i > 0) delay(FRAME_GAP_MS)
                    val (frame, detections) = captureAndDetect(model)
                    frames += detections
                    lastFrame = frame
                }
                val seen = CardModel.vote(frames, minFrames = MIN_FRAMES)
                poker = poker.copy(snapshot = lastFrame?.asImageBitmap(), detections = seen)
                applyScan(target, seen)
            } catch (e: TimeoutCancellationException) {
                poker = poker.copy(error = "לא התקבלה תמונה מהמצלמה. ודא שה-Passthrough פעיל ונסה שוב.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                poker = poker.copy(error = e.message ?: e.javaClass.simpleName)
            } finally {
                poker = poker.copy(scanning = null)
            }
        }
    }

    private suspend fun captureAndDetect(model: CardDetector): Pair<Bitmap, List<CardModel.Detection>> {
        val jpeg = camera.captureJpeg()
        return withContext(Dispatchers.Default) {
            val frame = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)
                ?: throw IllegalStateException("לא הצלחתי לפענח את התמונה מהמצלמה")
            frame to model.detect(frame)
        }
    }

    // ---- Automatic mode ----

    fun setAutoMode(enabled: Boolean) {
        poker = poker.copy(autoMode = enabled, error = null, note = null)
        if (enabled) startAutoLoop() else stopAutoLoop()
    }

    /**
     * Keeps scanning while the camera runs: every frame goes through the model, and cards that
     * stay visible across most of the recent frames are placed by [AutoAssign].
     */
    private fun startAutoLoop() {
        if (autoLoop?.isActive == true || !poker.cameraReady) return
        recentFrames.clear()
        autoLoop = viewModelScope.launch {
            val model = try {
                detector.await()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                return@launch // The load error is already on screen.
            }
            while (isActive) {
                try {
                    val (frame, detections) = captureAndDetect(model)
                    recentFrames.addLast(detections)
                    while (recentFrames.size > AUTO_WINDOW) recentFrames.removeFirst()
                    poker = poker.copy(
                        snapshot = frame.asImageBitmap(),
                        detections = CardModel.bestPerCard(detections),
                    )
                    val stable = CardModel.vote(recentFrames.toList(), minFrames = AUTO_MIN_FRAMES)
                    AutoAssign.next(poker.hole, poker.board, stable, ignoredCards)?.let(::applyAuto)
                } catch (e: TimeoutCancellationException) {
                    // No frame this time (passthrough paused?) - just try again.
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    poker = poker.copy(error = e.message ?: e.javaClass.simpleName)
                    delay(AUTO_ERROR_BACKOFF_MS)
                }
                delay(AUTO_GAP_MS)
            }
        }
    }

    private fun stopAutoLoop() {
        autoLoop?.cancel()
        autoLoop = null
        recentFrames.clear()
    }

    private fun applyAuto(update: AutoAssign.Update) {
        if (update.newHand) {
            ignoredCards.clear()
            recentFrames.clear()
            calculation?.cancel()
            poker = PokerState(
                cameraReady = poker.cameraReady,
                autoMode = poker.autoMode,
                opponents = poker.opponents,
                snapshot = poker.snapshot,
                detections = poker.detections,
                hole = update.hole,
                note = "זוהו קלפים חדשים אחרי הריבר, אז התחלתי יד חדשה.",
            )
        } else {
            poker = poker.copy(hole = update.hole, board = update.board, error = null)
        }
        recalculate()
    }

    private fun applyScan(target: ScanTarget, seen: List<CardModel.Detection>) {
        if (seen.isEmpty()) {
            poker = poker.copy(error = "לא זוהו קלפים. קרב את הקלפים למצלמה, ודא שהפינות (מספר וסמל) גלויות ונסה שוב.")
            return
        }
        poker = when (target) {
            ScanTarget.HOLE -> {
                val taken = poker.board.filterNotNull().toSet()
                val found = seen.filterNot { it.card in taken }
                val chosen = found.take(2).map { it.card }
                val note = when {
                    found.size > 2 -> "זוהו ${found.size} קלפים, ונבחרו 2 הבטוחים ביותר. לחץ על קלף כדי לתקן."
                    found.size == 1 -> "זוהה קלף אחד בלבד. צלם שוב או השלם את השני ידנית."
                    else -> null
                }
                poker.copy(hole = List(2) { chosen.getOrNull(it) }, note = note)
            }
            ScanTarget.BOARD -> {
                val taken = poker.hole.filterNotNull().toSet()
                val found = seen.filterNot { it.card in taken }
                // Most confident five, then shown left to right as they lie on the table.
                val chosen = found.take(5).sortedBy { it.centerX }.map { it.card }
                val note = if (found.size > 5) "זוהו ${found.size} קלפים, ונבחרו 5 הבטוחים ביותר. לחץ על קלף כדי לתקן." else null
                poker.copy(board = List(5) { chosen.getOrNull(it) }, note = note)
            }
        }
        recalculate()
    }

    // ---- Manual edits ----

    /** Manual correction from the card picker; null clears the slot. */
    fun setCard(slot: CardSlot, card: Int?) {
        if (card != null && card in poker.usedCards && card != poker.cardAt(slot)) return
        poker.cardAt(slot)?.takeIf { it != card }?.let { ignoredCards += it }
        poker = when (slot.target) {
            ScanTarget.HOLE -> poker.copy(hole = poker.hole.toMutableList().also { it[slot.index] = card })
            ScanTarget.BOARD -> poker.copy(board = poker.board.toMutableList().also { it[slot.index] = card })
        }
        recalculate()
    }

    fun changeOpponents(delta: Int) {
        val count = (poker.opponents + delta).coerceIn(1, 9)
        if (count == poker.opponents) return
        poker = poker.copy(opponents = count)
        recalculate()
    }

    fun onPotChange(text: String) {
        poker = poker.copy(pot = text.filter { it.isDigit() || it == '.' })
    }

    fun onToCallChange(text: String) {
        poker = poker.copy(toCall = text.filter { it.isDigit() || it == '.' })
    }

    fun newHand() {
        calculation?.cancel()
        ignoredCards.clear()
        recentFrames.clear()
        poker = PokerState(cameraReady = poker.cameraReady, autoMode = poker.autoMode, opponents = poker.opponents)
    }

    // ---- Odds ----

    /** Re-runs the simulation off the main thread whenever the cards or opponents change. */
    private fun recalculate() {
        calculation?.cancel()
        val hole = poker.hole.filterNotNull()
        if (hole.size < 2) {
            poker = poker.copy(result = null, calculating = false)
            return
        }
        val board = poker.board.filterNotNull()
        val opponents = poker.opponents
        poker = poker.copy(calculating = true)
        calculation = viewModelScope.launch {
            val result = withContext(Dispatchers.Default) {
                EquityCalculator.calculate(hole, board, opponents)
            }
            poker = poker.copy(result = result, calculating = false)
        }
    }

    override fun onCleared() {
        camera.release()
        loadedDetector?.close()
    }

    private companion object {
        // Button scans: 3 frames, a card must appear in 2.
        const val SCAN_FRAMES = 3
        const val MIN_FRAMES = 2
        const val FRAME_GAP_MS = 120L

        // Automatic mode: a card must appear in 3 of the last 4 frames.
        const val AUTO_WINDOW = 4
        const val AUTO_MIN_FRAMES = 3
        const val AUTO_GAP_MS = 150L
        const val AUTO_ERROR_BACKOFF_MS = 1_000L
    }
}
