plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.kotlin.serialization)
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

// Contract fixtures shared with the TypeScript side (packages/shared/fixtures).
val fixturesDir = rootProject.layout.projectDirectory.dir("../../packages/shared/fixtures")
tasks.withType<Test>().configureEach {
    inputs.dir(fixturesDir).withPropertyName("contractFixtures")
    systemProperty("lifelog.fixturesDir", fixturesDir.asFile.absolutePath)
}

dependencies {
    api(project(":core:data"))
    api(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    testImplementation(libs.junit)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
