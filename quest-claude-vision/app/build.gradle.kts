import java.net.URI
import java.security.MessageDigest
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.questclaude.vision"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.questclaude.vision"
        minSdk = 32
        targetSdk = 34
        versionCode = 3
        versionName = "0.4"
        // Quest headsets are arm64; skipping other ABIs keeps the APK small.
        ndk { abiFilters += "arm64-v8a" }
    }

    buildFeatures {
        compose = true
    }

    androidResources {
        // Store the model uncompressed so it loads quickly.
        noCompress += "onnx"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // Versions pinned to the newest releases that still build with AGP 8.13 / compileSdk 36.
    implementation(platform("androidx.compose:compose-bom:2025.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    // Runs the card-detection model on the headset - no network, no API key.
    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.31.1")

    testImplementation("junit:junit:4.13.2")
}

// ---- Card-detection model ----
// YOLOv8s trained on the 52 playing cards by Hamza Asif
// (github.com/Hamza-Asif-ai/Playing-Card-Detection-YOLOv8, AGPL-3.0 per the model's metadata).
// It is not stored in this repository; the build downloads a pinned version and checks its hash.
val cardModelUrl =
    "https://raw.githubusercontent.com/Hamza-Asif-ai/Playing-Card-Detection-YOLOv8/" +
        "2f693300ce4a819ddd5b4c14d090ea4738fe349e/best.onnx"
val cardModelSha256 = "f13fceb7ea3d7ed45034dcf41c457d370a50cfe0e3758e5f4856798ce00c7416"
val cardModelFile = layout.projectDirectory.file("src/main/assets/cards.onnx").asFile

fun sha256(file: java.io.File): String =
    MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it) }

val downloadCardModel by tasks.registering {
    description = "Downloads the playing-card detection model into the app assets."
    outputs.file(cardModelFile)
    outputs.upToDateWhen { cardModelFile.exists() && sha256(cardModelFile) == cardModelSha256 }
    doLast {
        cardModelFile.parentFile.mkdirs()
        logger.lifecycle("Downloading card model from $cardModelUrl")
        URI(cardModelUrl).toURL().openStream().use { input ->
            cardModelFile.outputStream().use { output -> input.copyTo(output) }
        }
        val actual = sha256(cardModelFile)
        if (actual != cardModelSha256) {
            cardModelFile.delete()
            throw GradleException("Card model checksum mismatch: expected $cardModelSha256, got $actual")
        }
    }
}

tasks.named("preBuild") { dependsOn(downloadCardModel) }
