package com.questclaude.vision

import android.util.Base64
import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.models.beta.messages.BetaBase64ImageSource
import com.anthropic.models.beta.messages.BetaContentBlockParam
import com.anthropic.models.beta.messages.BetaImageBlockParam
import com.anthropic.models.beta.messages.BetaOutputConfig
import com.anthropic.models.beta.messages.BetaStopReason
import com.anthropic.models.beta.messages.BetaTextBlockParam
import com.anthropic.models.beta.messages.MessageCreateParams

private const val MODEL = "claude-opus-5-5"

private const val SYSTEM_PROMPT = """
אתה עוזר שרואה את העולם דרך המצלמה של משקפי Meta Quest 3S שהמשתמש מרכיב.
לכל שאלה מצורפת תמונה של מה שנמצא מול המשתמש ברגע זה.
ענה בעברית, בקצרה ובבהירות (עד 3-4 משפטים), כי התשובה מוצגת בחלון קטן וגם מוקראת בקול.
אל תשתמש בכותרות, ברשימות או ב-Markdown.
אם משהו בתמונה לא ברור או לא נראה, אמור זאת במקום לנחש.
"""

/** Sends a camera snapshot plus a question to Claude and returns the answer text. */
class ClaudeVision(apiKey: String) {
    private val client: AnthropicClient = AnthropicOkHttpClient.builder()
        .apiKey(apiKey)
        .build()

    /** Blocking network call - run it off the main thread. */
    fun ask(jpeg: ByteArray, question: String): String {
        val image = BetaImageBlockParam.builder()
            .source(
                BetaBase64ImageSource.builder()
                    .data(Base64.encodeToString(jpeg, Base64.NO_WRAP))
                    .mediaType(BetaBase64ImageSource.MediaType.IMAGE_JPEG)
                    .build(),
            )
            .build()
        val text = BetaTextBlockParam.builder().text(question).build()

        val params = MessageCreateParams.builder()
            .model(MODEL)
            .maxTokens(16_000L)
            .system(SYSTEM_PROMPT.trim())
            // Low effort keeps answers fast, which matters while you are looking at something.
            .outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.LOW).build())
            // If a safety classifier declines, retry server-side on the model Anthropic recommends.
            .addBeta("server-side-fallback-2026-07-01")
            .putAdditionalBodyProperty("fallbacks", JsonValue.from("default"))
            .addUserMessageOfContentBlockParams(
                listOf(BetaContentBlockParam.ofImage(image), BetaContentBlockParam.ofText(text)),
            )
            .build()

        val response = client.beta().messages().create(params)
        if (response.stopReason().orElse(null) == BetaStopReason.REFUSAL) {
            return "Claude לא יכול לענות על הבקשה הזאת."
        }
        return response.content()
            .mapNotNull { block -> block.text().orElse(null)?.text() }
            .joinToString("\n")
            .trim()
            .ifEmpty { "לא התקבלה תשובה." }
    }
}
