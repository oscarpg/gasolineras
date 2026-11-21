pluginManagement {
    repositories {
        google()
        mavenCentral()
        // Google's mirror of Maven Central: used when Central doesn't answer (seen on CI runners).
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Google's mirror of Maven Central: used when Central doesn't answer (seen on CI runners).
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
    }
}

rootProject.name = "gasolineras"

include(":app")
include(":core")
include(":data")
include(":state")
include(":map-api")
include(":map-maplibre")
