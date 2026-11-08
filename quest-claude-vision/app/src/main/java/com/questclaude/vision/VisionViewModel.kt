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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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

class VisionViewModel(app: Application) : AndroidViewModel(app) {
    var ui by mutableStateOf(UiState())
        private set

    private val camera = PassthroughCamera(app)
    private val claude: ClaudeVision? =
        BuildConfig.ANTHROPIC_API_KEY.takeIf { it.isNotBlank() }?.let { ClaudeVision(it) }
    private val speaker = Speaker(app) { available -> ui = ui.copy(ttsAvailable = available) }

    init {
        if (claude == null) {
            ui = ui.copy(error = "חסר מפתח API. הוסף ANTHROPIC_API_KEY לקובץ local.properties ובנה מחדש (ראה README).")
        }
    }

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
        ui = ui.copy(error = "בלי הרשאת מצלמה האפליקציה לא יכולה לראות. אשר את ההרשאות בהגדרות האפליקציה.")
    }

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
                val jpeg = camera.captureJpeg()
                val bitmap = withContext(Dispatchers.Default) {
                    BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)?.asImageBitmap()
                }
                ui = ui.copy(snapshot = bitmap)

                val answer = withContext(Dispatchers.IO) { client.ask(jpeg, question) }
                ui = ui.copy(answer = answer, question = "")
                if (ui.speakAnswers) speaker.speak(answer)
            } catch (e: TimeoutCancellationException) {
                ui = ui.copy(error = "לא התקבלה תמונה מהמצלמה. ודא שה-Passthrough פעיל ונסה שוב.")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ui = ui.copy(error = describe(e))
            } finally {
                ui = ui.copy(busy = false)
            }
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
}
