package com.questclaude.vision

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val CAMERA_PERMISSIONS = arrayOf(
    Manifest.permission.CAMERA,
    "horizonos.permission.HEADSET_CAMERA",
)

/** One-tap questions shown as buttons. The label is what you see, the prompt is what Claude gets. */
private val QUICK_ACTIONS = listOf(
    "מה אני רואה?" to "מה נמצא מולי? תאר בקצרה.",
    "קרא ותרגם טקסט" to "קרא את הטקסט שמופיע בתמונה. אם הוא לא בעברית, תרגם אותו לעברית.",
    "מה זה ואיך משתמשים?" to "מה החפץ שבמרכז התמונה, ואיך משתמשים בו?",
)

class MainActivity : ComponentActivity() {
    private val vm: VisionViewModel by viewModels()

    private val permissionRequest =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            if (results.values.all { it }) vm.startCamera() else vm.onPermissionDenied()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                // Hebrew UI: lay everything out right-to-left even if the headset is set to English.
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Surface(Modifier.fillMaxSize()) {
                        VisionScreen(
                            state = vm.ui,
                            onAsk = vm::ask,
                            onQuestionChange = vm::onQuestionChange,
                            onSpeakAnswersChange = vm::onSpeakAnswersChange,
                        )
                    }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        val granted = CAMERA_PERMISSIONS.all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
        if (granted) vm.startCamera() else permissionRequest.launch(CAMERA_PERMISSIONS)
    }

    override fun onStop() {
        vm.stopCamera()
        super.onStop()
    }
}

@Composable
private fun VisionScreen(
    state: UiState,
    onAsk: (String) -> Unit,
    onQuestionChange: (String) -> Unit,
    onSpeakAnswersChange: (Boolean) -> Unit,
) {
    val canAsk = state.cameraReady && !state.busy

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Claude רואה", style = MaterialTheme.typography.headlineMedium)
        Text(
            if (state.cameraReady) "המצלמה פעילה. הסתכל על משהו ובחר שאלה."
            else "מפעיל את המצלמה…",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            QUICK_ACTIONS.forEach { (label, prompt) ->
                FilledTonalButton(onClick = { onAsk(prompt) }, enabled = canAsk) {
                    Text(label, fontSize = 18.sp)
                }
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = state.question,
                onValueChange = onQuestionChange,
                modifier = Modifier.weight(1f),
                label = { Text("או כתוב שאלה משלך") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { onAsk(state.question) }),
            )
            Spacer(Modifier.width(12.dp))
            Button(onClick = { onAsk(state.question) }, enabled = canAsk && state.question.isNotBlank()) {
                Text("שאל", fontSize = 18.sp)
            }
        }

        if (state.busy) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(28.dp))
                Spacer(Modifier.width(12.dp))
                Text("מצלם ושולח ל-Claude…", fontSize = 18.sp)
            }
        }

        state.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, fontSize = 18.sp)
        }

        if (state.answer.isNotEmpty()) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp)) {
                    Text(state.lastQuestion, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    Text(state.answer, fontSize = 22.sp, lineHeight = 32.sp)
                }
            }
        }

        state.snapshot?.let {
            Image(
                bitmap = it,
                contentDescription = "התמונה שנשלחה ל-Claude",
                modifier = Modifier.height(240.dp),
                contentScale = ContentScale.Fit,
            )
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(
                checked = state.speakAnswers && state.ttsAvailable,
                onCheckedChange = onSpeakAnswersChange,
                enabled = state.ttsAvailable,
            )
            Spacer(Modifier.width(12.dp))
            Text(
                if (state.ttsAvailable) "הקרא תשובות בקול"
                else "הקראה בעברית לא זמינה במכשיר. התשובות יוצגו כטקסט.",
            )
        }
    }
}
