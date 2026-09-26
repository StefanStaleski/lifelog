plugins {
    alias(libs.plugins.android.library)
}

android {
    namespace = "io.github.stefanstaleski.lifelog.core.data"
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

    testImplementation(libs.junit)
}
