package com.questclaude.vision

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection

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
                        PokerScreen(
                            state = vm.poker,
                            onAutoModeChange = vm::setAutoMode,
                            onScan = vm::scanCards,
                            onSetCard = vm::setCard,
                            onChangeOpponents = vm::changeOpponents,
                            onPotChange = vm::onPotChange,
                            onToCallChange = vm::onToCallChange,
                            onNewHand = vm::newHand,
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
