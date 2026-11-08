package com.questclaude.vision

import android.app.Application
import android.graphics.BitmapFactory
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.BadRequestException
import com.anthropic.errors.InternalServerException
import com.anthropic.errors.PermissionDeniedException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.questclaude.vision.poker.EquityCalculator
import com.questclaude.vision.poker.EquityResult
import com.questclaude.vision.poker.HandCategory
import com.questclaude.vision.poker.HandEvaluator
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** State of the free-question tab (and of the camera, shared by both tabs). */
data class UiState(
    val cameraReady: Boolean = false,
    val busy: Boolean = false,
    val question: String = "",
    val lastQuestion: String = "",
    val answer: String = "",
    val error: String? = null,
    val snapshot: ImageBitmap? = null,
    val speakAnswers: Boolean = true,
    val ttsAvailable: Boolean = false,
)

/** A position on the table: one of your 2 hole cards or one of the 5 board cards. */
data class CardSlot(val target: ScanTarget, val index: Int)

/** State of the poker tab. Card lists have fixed slots; null means "not known yet". */
data class PokerState(
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
    var ui by mutableStateOf(UiState())
        private set
    var poker by mutableStateOf(PokerState())
        private set

    private val camera = PassthroughCamera(app)
    private val claude: ClaudeVision? =
        BuildConfig.ANTHROPIC_API_KEY.takeIf { it.isNotBlank() }?.let { ClaudeVision(it) }
    private val speaker = Speaker(app) { available -> ui = ui.copy(ttsAvailable = available) }
    private var calculation: Job? = null

    init {
        if (claude == null) {
            val missingKey = "חסר מפתח API. הוסף ANTHROPIC_API_KEY לקובץ local.properties ובנה מחדש (ראה README)."
            ui = ui.copy(error = missingKey)
            poker = poker.copy(error = missingKey)
        }
    }

    // ---- Camera ----

    fun startCamera() {
        viewModelScope.launch {
            try {
                camera.open()
                ui = ui.copy(cameraReady = true)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ui = ui.copy(cameraReady = false, error = e.message ?: "לא הצלחתי להפעיל את המצלמה")
            }
        }
    }

    fun stopCamera() {
        camera.close()
        speaker.stop()
        ui = ui.copy(cameraReady = false)
    }

    fun onPermissionDenied() {
        val message = "בלי הרשאת מצלמה האפליקציה לא יכולה לראות. אשר את ההרשאות בהגדרות האפליקציה."
        ui = ui.copy(error = message)
        poker = poker.copy(error = message)
    }

    private suspend fun snapshot(): Pair<ByteArray, ImageBitmap?> {
        val jpeg = camera.captureJpeg()
        val bitmap = withContext(Dispatchers.Default) {
            BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)?.asImageBitmap()
        }
        return jpeg to bitmap
    }

    // ---- Free question tab ----

    fun onQuestionChange(text: String) {
        ui = ui.copy(question = text)
    }

    fun onSpeakAnswersChange(enabled: Boolean) {
        if (!enabled) speaker.stop()
        ui = ui.copy(speakAnswers = enabled)
    }

    fun ask(question: String) {
        val client = claude ?: return
        if (ui.busy || question.isBlank() || !ui.cameraReady) return
        speaker.stop()
        ui = ui.copy(busy = true, error = null, answer = "", lastQuestion = question)

        viewModelScope.launch {
            try {
                val (jpeg, bitmap) = snapshot()
                ui = ui.copy(snapshot = bitmap)
                val answer = withContext(Dispatchers.IO) { client.ask(jpeg, question) }
                ui = ui.copy(answer = answer, question = "")
                if (ui.speakAnswers) speaker.speak(answer)
            } catch (e: TimeoutCancellationException) {
                ui = ui.copy(error = NO_FRAME)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ui = ui.copy(error = describe(e))
            } finally {
                ui = ui.copy(busy = false)
            }
        }
    }

    // ---- Poker tab ----

    /** Photographs your hole cards or the board and lets Claude read them. */
    fun scanCards(target: ScanTarget) {
        val client = claude ?: return
        if (poker.scanning != null || !ui.cameraReady) return
        poker = poker.copy(scanning = target, error = null, note = null)

        viewModelScope.launch {
            try {
                val (jpeg, bitmap) = snapshot()
                poker = poker.copy(snapshot = bitmap)
                val scan = withContext(Dispatchers.IO) { client.readCards(jpeg, target) }
                applyScan(target, scan)
            } catch (e: TimeoutCancellationException) {
                poker = poker.copy(error = NO_FRAME)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                poker = poker.copy(error = describe(e))
            } finally {
                poker = poker.copy(scanning = null)
            }
        }
    }

    private fun applyScan(target: ScanTarget, scan: CardScan) {
        val note = scan.note.ifEmpty { null }
        if (scan.cards.isEmpty()) {
            poker = poker.copy(error = "לא זוהו קלפים. קרב את הקלפים למצלמה ונסה שוב.", note = note)
            return
        }
        poker = when (target) {
            ScanTarget.HOLE -> {
                val taken = poker.board.filterNotNull().toSet()
                val cards = scan.cards.filterNot { it in taken }.take(2)
                poker.copy(hole = List(2) { cards.getOrNull(it) }, note = note)
            }
            ScanTarget.BOARD -> {
                val taken = poker.hole.filterNotNull().toSet()
                val cards = scan.cards.filterNot { it in taken }.take(5)
                poker.copy(board = List(5) { cards.getOrNull(it) }, note = note)
            }
        }
        recalculate()
    }

    /** Manual correction from the card picker; null clears the slot. */
    fun setCard(slot: CardSlot, card: Int?) {
        if (card != null && card in poker.usedCards && card != poker.cardAt(slot)) return
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
        poker = PokerState(opponents = poker.opponents, error = poker.error.takeIf { claude == null })
    }

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

    private fun describe(e: Exception): String = when (e) {
        is UnauthorizedException -> "מפתח ה-API לא תקין. בדוק את ANTHROPIC_API_KEY ב-local.properties."
        is PermissionDeniedException -> "למפתח ה-API אין הרשאה למודל הזה."
        is RateLimitException -> "יותר מדי בקשות ברגע זה. חכה כמה שניות ונסה שוב."
        is BadRequestException -> "הבקשה נדחתה: ${e.message}"
        is InternalServerException -> "תקלה זמנית אצל Anthropic. נסה שוב בעוד רגע."
        is AnthropicServiceException -> "שגיאה מה-API: ${e.message}"
        is AnthropicIoException -> "אין חיבור לאינטרנט. בדוק את ה-Wi-Fi של המשקפיים."
        else -> e.message ?: e.javaClass.simpleName
    }

    override fun onCleared() {
        camera.release()
        speaker.shutdown()
    }

    private companion object {
        const val NO_FRAME = "לא התקבלה תמונה מהמצלמה. ודא שה-Passthrough פעיל ונסה שוב."
    }
}
