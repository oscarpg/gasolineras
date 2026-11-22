pluginManagement {
    repositories {
        google()
        // Google's mirror of Maven Central first: Central rate-limits CI runners (HTTP 429), and Gradle
        // only falls through to the next repository when an artifact is missing, not when refused.
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        maven("https://maven-central.storage-download.googleapis.com/maven2/") // see pluginManagement
        mavenCentral()
    }
}

rootProject.name = "gasolineras"

include(":app")
include(":core")
include(":data")
include(":state")
include(":map-api")
include(":map-maplibre")
