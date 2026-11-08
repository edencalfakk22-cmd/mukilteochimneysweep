package com.questclaude.vision

import android.util.Base64
import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.models.beta.messages.BetaBase64ImageSource
import com.anthropic.models.beta.messages.BetaContentBlockParam
import com.anthropic.models.beta.messages.BetaImageBlockParam
import com.anthropic.models.beta.messages.BetaJsonOutputFormat
import com.anthropic.models.beta.messages.BetaMessage
import com.anthropic.models.beta.messages.BetaOutputConfig
import com.anthropic.models.beta.messages.BetaStopReason
import com.anthropic.models.beta.messages.BetaTextBlockParam
import com.anthropic.models.beta.messages.MessageCreateParams
import com.questclaude.vision.poker.Cards
import org.json.JSONObject

private const val MODEL = "claude-opus-5-5"

private const val ASK_SYSTEM_PROMPT = """
אתה עוזר שרואה את העולם דרך המצלמה של משקפי Meta Quest 3S שהמשתמש מרכיב.
לכל שאלה מצורפת תמונה של מה שנמצא מול המשתמש ברגע זה.
ענה בעברית, בקצרה ובבהירות (עד 3-4 משפטים), כי התשובה מוצגת בחלון קטן וגם מוקראת בקול.
אל תשתמש בכותרות, ברשימות או ב-Markdown.
אם משהו בתמונה לא ברור או לא נראה, אמור זאת במקום לנחש.
"""

private const val CARD_RULES = """
Write each card as rank + suit. Rank is one of 2 3 4 5 6 7 8 9 T J Q K A (T means ten).
Suit is s (spades ♠), h (hearts ♥), d (diamonds ♦) or c (clubs ♣).
Include a card only when both its rank and its suit are clearly readable; never guess a card
you cannot see. In "note", write one short sentence in Hebrew about anything that made reading
hard (a card partly hidden, glare, blur), or leave it empty when every card was clear.
"""

/** Which cards a snapshot is meant to capture. */
enum class ScanTarget { HOLE, BOARD }

class CardScan(val cards: List<Int>, val note: String)

class CardScanException(message: String) : Exception(message)

/** Talks to Claude: free questions about a snapshot, and reading playing cards from one. */
class ClaudeVision(apiKey: String) {
    private val client: AnthropicClient = AnthropicOkHttpClient.builder()
        .apiKey(apiKey)
        .build()

    /** Blocking network call - run it off the main thread. */
    fun ask(jpeg: ByteArray, question: String): String {
        val response = send(
            system = ASK_SYSTEM_PROMPT.trim(),
            jpeg = jpeg,
            text = question,
            outputConfig = BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.LOW).build(),
        )
        if (response.isRefusal()) return "Claude לא יכול לענות על הבקשה הזאת."
        return response.text().ifEmpty { "לא התקבלה תשובה." }
    }

    /**
     * Reads the cards in a snapshot. The answer is constrained by a JSON schema whose card list
     * only allows the 52 valid codes, so the result never contains a malformed card.
     * Blocking network call - run it off the main thread.
     */
    fun readCards(jpeg: ByteArray, target: ScanTarget): CardScan {
        val task = when (target) {
            ScanTarget.HOLE ->
                "The photo shows the wearer's own hole cards in a Texas Hold'em game: usually two " +
                    "cards held in the hand or lifted off the table close to the camera. Report only those cards."
            ScanTarget.BOARD ->
                "The photo shows a Texas Hold'em table. Report only the face-up community cards in the " +
                    "middle of the table (flop, turn and river: 0 to 5 cards), in order from left to right. " +
                    "Ignore cards held by players, face-down cards and discard piles."
        }
        val response = send(
            system = "You read playing cards from photos taken by a camera on the user's headset.",
            jpeg = jpeg,
            text = task + "\n" + CARD_RULES.trim(),
            outputConfig = BetaOutputConfig.builder()
                .effort(BetaOutputConfig.Effort.LOW)
                .format(cardScanFormat)
                .build(),
        )
        if (response.isRefusal()) throw CardScanException("Claude סירב לזהות את הקלפים בתמונה הזאת.")

        val json = JSONObject(response.text())
        val codes = json.getJSONArray("cards")
        val cards = (0 until codes.length()).mapNotNull { Cards.parse(codes.getString(it)) }.distinct()
        return CardScan(cards, json.optString("note").trim())
    }

    private fun send(system: String, jpeg: ByteArray, text: String, outputConfig: BetaOutputConfig): BetaMessage {
        val image = BetaImageBlockParam.builder()
            .source(
                BetaBase64ImageSource.builder()
                    .data(Base64.encodeToString(jpeg, Base64.NO_WRAP))
                    .mediaType(BetaBase64ImageSource.MediaType.IMAGE_JPEG)
                    .build(),
            )
            .build()
        val params = MessageCreateParams.builder()
            .model(MODEL)
            .maxTokens(16_000L)
            .system(system)
            // Low effort keeps answers fast, which matters while you are looking at something.
            .outputConfig(outputConfig)
            // If a safety classifier declines, retry server-side on the model Anthropic recommends.
            .addBeta("server-side-fallback-2026-07-01")
            .putAdditionalBodyProperty("fallbacks", JsonValue.from("default"))
            .addUserMessageOfContentBlockParams(
                listOf(
                    BetaContentBlockParam.ofImage(image),
                    BetaContentBlockParam.ofText(BetaTextBlockParam.builder().text(text).build()),
                ),
            )
            .build()
        return client.beta().messages().create(params)
    }

    private fun BetaMessage.isRefusal() = stopReason().orElse(null) == BetaStopReason.REFUSAL

    private fun BetaMessage.text(): String =
        content().mapNotNull { block -> block.text().orElse(null)?.text() }.joinToString("\n").trim()

    private val cardScanFormat: BetaJsonOutputFormat = BetaJsonOutputFormat.builder()
        .schema(
            BetaJsonOutputFormat.Schema.builder()
                .putAdditionalProperty("type", JsonValue.from("object"))
                .putAdditionalProperty(
                    "properties",
                    JsonValue.from(
                        mapOf(
                            "cards" to mapOf(
                                "type" to "array",
                                "items" to mapOf("type" to "string", "enum" to Cards.ALL_CODES),
                            ),
                            "note" to mapOf("type" to "string"),
                        ),
                    ),
                )
                .putAdditionalProperty("required", JsonValue.from(listOf("cards", "note")))
                .putAdditionalProperty("additionalProperties", JsonValue.from(false))
                .build(),
        )
        .build()
}
