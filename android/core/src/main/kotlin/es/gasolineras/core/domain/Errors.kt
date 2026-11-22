package es.gasolineras.core.domain

/**
 * Errors the user may see, identified by a code instead of a sentence, so the UI
 * can show them in the user's language.
 */
enum class AppErrorCode(val id: String) {
    DOWNLOAD_FAILED("download-failed"),
    TIMEOUT("timeout"),
    HTTP("http"),
    GEOLOCATION_UNAVAILABLE("geolocation-unavailable"),
    GEOLOCATION_DENIED("geolocation-denied"),
    GEOLOCATION_TIMEOUT("geolocation-timeout"),
}

open class AppError(
    val code: AppErrorCode,
    /** Extra values for the message, e.g. `status to 429`. */
    val params: Map<String, Any> = emptyMap(),
    /** Technical detail for logs (not shown to the user). */
    detail: String? = null,
    cause: Throwable? = null,
) : Exception(detail ?: code.id, cause)
