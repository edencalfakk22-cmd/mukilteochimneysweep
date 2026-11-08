package com.questclaude.vision

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import com.questclaude.vision.poker.CardModel
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.questclaude.vision.poker.Cards
import com.questclaude.vision.poker.EquityResult
import com.questclaude.vision.poker.HandCategory
import com.questclaude.vision.poker.OpponentStyle
import java.util.Locale

private val CardRed = Color(0xFFD32F2F)
private val Good = Color(0xFF66BB6A)
private val Bad = Color(0xFFEF5350)

private fun pct(value: Double) = String.format(Locale.US, "%.1f%%", value * 100)

@Composable
fun PokerScreen(
    state: PokerState,
    onAutoModeChange: (Boolean) -> Unit,
    onZoomChange: (Boolean) -> Unit,
    onScan: (ScanTarget) -> Unit,
    onSetCard: (CardSlot, Int?) -> Unit,
    onChangeOpponents: (Int) -> Unit,
    onOpponentStyleChange: (OpponentStyle) -> Unit,
    onPotChange: (String) -> Unit,
    onToCallChange: (String) -> Unit,
    onNewHand: () -> Unit,
    onSaveFrame: () -> Unit,
) {
    var editing by remember { mutableStateOf<CardSlot?>(null) }
    val cameraReady = state.cameraReady
    val canScan = cameraReady && state.scanning == null && !state.autoMode

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Switch(checked = state.autoMode, onCheckedChange = onAutoModeChange)
            Text("זיהוי אוטומטי", fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(autoStatus(state), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 18.sp)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Switch(checked = state.zoom, onCheckedChange = onZoomChange)
            Text("זום למרכז (לקלפים רחוקים)", fontSize = 18.sp)
            state.detectMs?.let {
                Spacer(Modifier.width(24.dp))
                Text("זמן זיהוי לתמונה: $it אלפיות שנייה" + (state.engine?.let { e -> " · $e" } ?: ""), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        CardRow(
            title = "הקלפים שלי",
            cards = state.hole,
            target = ScanTarget.HOLE,
            scanLabel = "📷 צלם את הקלפים שלי",
            scanning = state.scanning == ScanTarget.HOLE,
            canScan = canScan,
            onScan = onScan,
            onEdit = { editing = it },
        )
        CardRow(
            title = "השולחן",
            cards = state.board,
            target = ScanTarget.BOARD,
            scanLabel = "📷 צלם את השולחן",
            scanning = state.scanning == ScanTarget.BOARD,
            canScan = canScan,
            onScan = onScan,
            onEdit = { editing = it },
        )
        Text(
            if (cameraReady) "לחץ על קלף כדי לתקן אותו ידנית." else "מפעיל את המצלמה…",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("יריבים ביד", fontSize = 18.sp)
            OutlinedButton(onClick = { onChangeOpponents(-1) }, enabled = state.opponents > 1) { Text("−", fontSize = 20.sp) }
            Text("${state.opponents}", fontSize = 24.sp, fontWeight = FontWeight.Bold)
            OutlinedButton(onClick = { onChangeOpponents(1) }, enabled = state.opponents < 9) { Text("+", fontSize = 20.sp) }
            Spacer(Modifier.width(24.dp))
            OutlinedTextField(
                value = state.pot,
                onValueChange = onPotChange,
                label = { Text("קופה") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.width(140.dp),
            )
            OutlinedTextField(
                value = state.toCall,
                onValueChange = onToCallChange,
                label = { Text("סכום ל-Call") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.width(140.dp),
            )
            Spacer(Modifier.width(24.dp))
            FilledTonalButton(onClick = onNewHand) { Text("יד חדשה", fontSize = 18.sp) }
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("סוג היריבים", fontSize = 18.sp)
            OpponentStyle.entries.forEach { style ->
                FilterChip(
                    selected = state.opponentStyle == style,
                    onClick = { onOpponentStyleChange(style) },
                    label = { Text(style.label, fontSize = 16.sp) },
                )
            }
        }

        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 18.sp) }
        state.note?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }

        when {
            state.result != null -> Results(state, state.result)
            state.calculating -> LinearProgressIndicator(Modifier.fillMaxWidth())
            else -> Text(
                if (state.autoMode) "הסתכל מקרוב על שני הקלפים שלך, והסיכויים יופיעו כאן."
                else "צלם או בחר את שני הקלפים שלך כדי לראות סיכויים.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 18.sp,
            )
        }

        state.snapshot?.let {
            Snapshot(
                image = it,
                detections = state.detections,
                title = if (state.autoMode) "מה המודל רואה עכשיו:" else "מה המודל זיהה בצילום האחרון:",
                zoom = state.zoom,
                onSave = onSaveFrame,
            )
        }
    }

    editing?.let { slot ->
        CardPicker(
            current = state.cardAt(slot),
            used = state.usedCards,
            onPick = { card ->
                onSetCard(slot, card)
                editing = null
            },
            onDismiss = { editing = null },
        )
    }
}

/** What automatic mode is waiting for, following the order of a hand. */
private fun autoStatus(state: PokerState): String {
    if (!state.autoMode) return "כבוי: צלם בכפתורים"
    val boardCount = state.board.count { it != null }
    return when {
        !state.cameraReady -> "מחכה למצלמה…"
        state.hole.any { it == null } -> "מחפש את הקלפים שלך: הסתכל עליהם מקרוב"
        boardCount == 0 -> "מחכה לפלופ"
        boardCount < 5 -> "מחכה לקלף הבא על השולחן"
        else -> "היד הושלמה. כשיחולקו קלפים חדשים תתחיל יד חדשה"
    }
}

/** The last camera frame with a box and label on every card corner the model recognised. */
@Composable
private fun Snapshot(
    image: ImageBitmap,
    detections: List<CardModel.Detection>,
    title: String,
    zoom: Boolean,
    onSave: () -> Unit,
) {
    val textMeasurer = rememberTextMeasurer()
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(16.dp))
            // Saves the frame on the headset so a misread can be sent back for tuning.
            TextButton(onClick = onSave) { Text("💾 שמור צילום לבדיקה") }
        }
        Box(
            Modifier
                .height(280.dp)
                .aspectRatio(image.width.toFloat() / image.height),
        ) {
            Image(bitmap = image, contentDescription = "הצילום האחרון", modifier = Modifier.fillMaxSize())
            Canvas(Modifier.fillMaxSize()) {
                val sx = size.width / image.width
                val sy = size.height / image.height
                if (zoom) {
                    // The area the model examines when zoom is on: the central half of the frame.
                    drawRect(
                        color = Color.White.copy(alpha = 0.7f),
                        topLeft = Offset(size.width / 4, size.height / 4),
                        size = Size(size.width / 2, size.height / 2),
                        style = Stroke(width = 2f),
                    )
                }
                for (d in detections) {
                    val topLeft = Offset(d.left * sx, d.top * sy)
                    drawRect(
                        color = Color.Yellow,
                        topLeft = topLeft,
                        size = Size((d.right - d.left) * sx, (d.bottom - d.top) * sy),
                        style = Stroke(width = 3f),
                    )
                    drawText(
                        textMeasurer = textMeasurer,
                        text = "${Cards.label(d.card)} ${(d.confidence * 100).toInt()}%",
                        topLeft = Offset(topLeft.x, (topLeft.y - 22f).coerceAtLeast(0f)),
                        style = TextStyle(color = Color.Yellow, fontSize = 13.sp, background = Color.Black.copy(alpha = 0.6f)),
                    )
                }
            }
        }
    }
}

@Composable
private fun CardRow(
    title: String,
    cards: List<Int?>,
    target: ScanTarget,
    scanLabel: String,
    scanning: Boolean,
    canScan: Boolean,
    onScan: (ScanTarget) -> Unit,
    onEdit: (CardSlot) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, fontSize = 20.sp, modifier = Modifier.width(120.dp))
        // Cards read left to right like on the table, even inside the RTL layout.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                cards.forEachIndexed { index, card ->
                    PlayingCard(card) { onEdit(CardSlot(target, index)) }
                }
            }
        }
        Spacer(Modifier.width(16.dp))
        FilledTonalButton(onClick = { onScan(target) }, enabled = canScan) {
            if (scanning) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
                Text("מזהה…", fontSize = 18.sp)
            } else {
                Text(scanLabel, fontSize = 18.sp)
            }
        }
    }
}

@Composable
private fun PlayingCard(card: Int?, size: Pair<Int, Int> = 56 to 80, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(8.dp),
        color = if (card == null) MaterialTheme.colorScheme.surfaceVariant else Color.White,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.size(size.first.dp, size.second.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = card?.let { Cards.label(it) } ?: "?",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = when {
                    card == null -> MaterialTheme.colorScheme.onSurfaceVariant
                    Cards.isRed(card) -> CardRed
                    else -> Color.Black
                },
            )
        }
    }
}

@Composable
private fun Results(state: PokerState, result: EquityResult) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text("סיכוי לזכות בקופה", fontSize = 20.sp)
                Spacer(Modifier.width(16.dp))
                Text(pct(result.equity), fontSize = 44.sp, fontWeight = FontWeight.Bold)
                if (state.calculating) {
                    Spacer(Modifier.width(12.dp))
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                }
            }
            Text(
                "ניצחון ${pct(result.win)} · תיקו ${pct(result.tie)} · " +
                    "מול ${result.opponents} ${if (result.opponents == 1) "יריב" else "יריבים"} " +
                    "(${state.opponentStyle.description}) · ${"%,d".format(result.iterations)} סימולציות",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            state.currentCategory?.let {
                Text("יש לך עכשיו: ${HandCategory.HEBREW_NAMES[it]}", fontSize = 20.sp)
            }

            val boardComplete = state.board.all { it != null }
            if (!boardComplete) {
                val hole = state.hole.filterNotNull()
                val pocketPair = hole.size == 2 && Cards.rank(hole[0]) == Cards.rank(hole[1])
                val current = state.currentCategory
                    ?: if (pocketPair) HandCategory.PAIR else HandCategory.HIGH_CARD
                val chances = (HandCategory.COUNT - 1 downTo current + 1)
                    .map { it to result.finalCategoryOdds[it] }
                    .filter { it.second >= 0.005 }
                if (chances.isNotEmpty()) {
                    Text(
                        "סיכוי להשתפר עד הריבר: " + chances.joinToString(" · ") { (category, odds) ->
                            "${HandCategory.HEBREW_NAMES[category]} ${pct(odds)}"
                        },
                    )
                }
            }

            state.potOdds?.let { needed ->
                val profitable = result.equity > needed
                Text(
                    "כדי ש-Call ישתלם צריך לפחות ${pct(needed)}. " +
                        if (profitable) "יש לך יותר, ולכן Call משתלם לאורך זמן." else "יש לך פחות, ולכן Call לא משתלם.",
                    color = if (profitable) Good else Bad,
                    fontSize = 18.sp,
                )
            }

            Text(
                if (state.opponentStyle == OpponentStyle.ANY) {
                    "החישוב מניח שליריבים יש ידיים אקראיות. אם מישהו מהמר חזק, בחר \"הדוק\" או \"מהמר חזק\" למעלה."
                } else {
                    "החישוב מניח שהיריבים מחזיקים רק ידיים מתוך ${state.opponentStyle.description}, לפי דירוג ידיי פתיחה."
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
            )
        }
    }
}

@Composable
private fun CardPicker(current: Int?, used: Set<Int>, onPick: (Int?) -> Unit, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("בחר קלף", style = MaterialTheme.typography.titleLarge)
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        for (suit in 0 until 4) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                for (rank in 12 downTo 0) {
                                    val card = Cards.of(rank, suit)
                                    val available = card !in used || card == current
                                    if (available) {
                                        PlayingCard(card, size = 44 to 60) { onPick(card) }
                                    } else {
                                        Box(Modifier.size(44.dp, 60.dp))
                                    }
                                }
                            }
                        }
                    }
                }
                Row {
                    TextButton(onClick = { onPick(null) }) { Text("הסר קלף") }
                    TextButton(onClick = onDismiss) { Text("ביטול") }
                }
            }
        }
    }
}
