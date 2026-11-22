import org.jetbrains.kotlin.gradle.dsl.JvmTarget

/** Data layer: MITECO, geocoding, routing, cache, preferences. Pure Kotlin/JVM (no Android imports). */
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

// Same real API samples as the web app's tests.
sourceSets["test"].resources.srcDir("../../tests/fixtures")

dependencies {
    api(project(":core"))
    api(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
