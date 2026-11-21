import org.jetbrains.kotlin.gradle.dsl.JvmTarget

/** Pure Kotlin domain logic (port of the web app's src/domain + src/config). No Android imports. */
plugins {
    alias(libs.plugins.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    testImplementation(libs.junit)
}
