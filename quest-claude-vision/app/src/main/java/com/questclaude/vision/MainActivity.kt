package com.questclaude.vision

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.sp

private val CAMERA_PERMISSIONS = arrayOf(
    Manifest.permission.CAMERA,
    "horizonos.permission.HEADSET_CAMERA",
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
                        var tab by rememberSaveable { mutableIntStateOf(0) }
                        Column {
                            PrimaryTabRow(selectedTabIndex = tab) {
                                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("פוקר", fontSize = 18.sp) })
                                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("שאלה חופשית", fontSize = 18.sp) })
                            }
                            when (tab) {
                                0 -> PokerScreen(
                                    state = vm.poker,
                                    cameraReady = vm.ui.cameraReady,
                                    onScan = vm::scanCards,
                                    onSetCard = vm::setCard,
                                    onChangeOpponents = vm::changeOpponents,
                                    onPotChange = vm::onPotChange,
                                    onToCallChange = vm::onToCallChange,
                                    onNewHand = vm::newHand,
                                )
                                else -> AskScreen(
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
