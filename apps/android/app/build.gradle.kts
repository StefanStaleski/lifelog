import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

// Per-machine secrets live in the git-ignored local.properties, never in source.
val localProps = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use(::load)
}
// Default works over USB with `adb reverse tcp:3000 tcp:3000` and `pnpm --filter web dev`.
val apiBaseUrl = localProps.getProperty("lifelog.apiBaseUrl", "http://localhost:3000/")
    .let { if (it.endsWith("/")) it else "$it/" }
val deviceToken = localProps.getProperty("lifelog.deviceToken", "")

android {
    namespace = "io.github.stefanstaleski.lifelog"
    compileSdk = 37

    defaultConfig {
        applicationId = "io.github.stefanstaleski.lifelog"
        minSdk = 30
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"

        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "DEVICE_TOKEN", "\"$deviceToken\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(project(":core:data"))
    implementation(project(":sync"))
    implementation(project(":core:network"))
    implementation(project(":collectors"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.hilt.viewmodel.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)

    testImplementation(libs.junit)
    testImplementation(libs.truth)
    testImplementation(libs.robolectric)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
}

// `./gradlew :app:testDebugUnitTest -Plifelog.screenshots` renders the screens to app/build/screenshots.
val screenshots = providers.gradleProperty("lifelog.screenshots").isPresent
tasks.withType<Test>().configureEach {
    systemProperty("lifelog.screenshots", screenshots.toString())
    systemProperty("roborazzi.test.record", screenshots.toString())
    if (screenshots) outputs.upToDateWhen { false }
}
