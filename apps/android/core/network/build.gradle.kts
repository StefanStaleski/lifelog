plugins {
    alias(libs.plugins.android.library)
}

android {
    namespace = "io.github.stefanstaleski.lifelog.core.network"
    compileSdk = 37

    defaultConfig {
        minSdk = 30
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":core:data"))
    testImplementation(libs.junit)
}
