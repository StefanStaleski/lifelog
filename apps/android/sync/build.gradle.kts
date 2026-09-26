plugins {
    alias(libs.plugins.android.library)
}

android {
    namespace = "io.github.stefanstaleski.lifelog.sync"
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
    implementation(project(":core:network"))
    implementation(project(":collectors"))
    testImplementation(libs.junit)
}
