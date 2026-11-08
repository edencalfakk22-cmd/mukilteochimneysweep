package com.questclaude.vision

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

/**
 * Reads answers aloud in Hebrew. Horizon OS may ship without a Hebrew voice, so [onReady]
 * reports whether speech is actually available and the UI falls back to text only.
 */
class Speaker(context: Context, private val onReady: (available: Boolean) -> Unit) {
    private var available = false

    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        available = status == TextToSpeech.SUCCESS && hasHebrew()
        onReady(available)
    }

    private fun hasHebrew(): Boolean {
        val result = tts.setLanguage(Locale.forLanguageTag("he-IL"))
        return result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED
    }

    fun speak(text: String) {
        if (available) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "answer")
    }

    fun stop() {
        tts.stop()
    }

    fun shutdown() {
        tts.shutdown()
    }
}
