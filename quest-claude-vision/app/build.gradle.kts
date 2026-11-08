import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// The Claude API key is read from local.properties (git-ignored), e.g.
//   ANTHROPIC_API_KEY=sk-ant-...
// It ends up inside the APK, so keep the APK for your own headset only.
val localProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val anthropicApiKey: String = localProps.getProperty("ANTHROPIC_API_KEY", "").trim()

android {
    namespace = "com.questclaude.vision"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.questclaude.vision"
        minSdk = 32
        targetSdk = 34
        versionCode = 1
        versionName = "0.1"
        buildConfigField("String", "ANTHROPIC_API_KEY", "\"$anthropicApiKey\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "META-INF/DEPENDENCIES",
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/versions/9/OSGI-INF/MANIFEST.MF",
            )
        }
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
    implementation("com.anthropic:anthropic-java:3.6.0")

    testImplementation("junit:junit:4.13.2")
}
