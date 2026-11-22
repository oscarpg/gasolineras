package es.gasolineras.data.http

import es.gasolineras.core.domain.AppError
import es.gasolineras.core.domain.AppErrorCode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.io.InterruptedIOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** A non-2xx response. Shown to the user as `errors.http` with the status. */
class HttpError(val status: Int, val url: String) :
    AppError(AppErrorCode.HTTP, mapOf("status" to status), "HTTP $status")

data class HttpResponse(val status: Int, val body: String) {
    val isSuccessful: Boolean get() = status in 200..299
}

interface HttpClient {
    /**
     * GET [url]. Throws [HttpError] for non-2xx responses unless [allowHttpErrors]
     * (some APIs explain errors in the body), and [AppError] TIMEOUT when it takes too long.
     */
    suspend fun get(url: String, headers: Map<String, String> = emptyMap(), allowHttpErrors: Boolean = false): HttpResponse
}

suspend fun HttpClient.getText(url: String, headers: Map<String, String> = emptyMap()): String = get(url, headers).body

internal val LenientJson = Json { ignoreUnknownKeys = true }

/** GET and parse JSON. With [allowHttpErrors], a non-JSON error page is still an [HttpError]. */
suspend fun HttpClient.getJson(url: String, allowHttpErrors: Boolean = false): JsonElement {
    val response = get(url, allowHttpErrors = allowHttpErrors)
    return try {
        LenientJson.parseToJsonElement(response.body)
    } catch (e: Exception) {
        if (!response.isSuccessful) throw HttpError(response.status, url)
        throw e
    }
}

/** [HttpClient] on OkHttp, with a per-call timeout and an identifying User-Agent. */
class OkHttpHttpClient(
    private val client: OkHttpClient,
    private val userAgent: String,
    private val timeoutMs: Long = 30_000,
) : HttpClient {
    override suspend fun get(url: String, headers: Map<String, String>, allowHttpErrors: Boolean): HttpResponse {
        val request = Request.Builder().url(url).header("User-Agent", userAgent).apply {
            headers.forEach { (name, value) -> header(name, value) }
        }.build()
        val call = client.newCall(request)
        call.timeout().timeout(timeoutMs, TimeUnit.MILLISECONDS)
        val response = try {
            call.await()
        } catch (e: InterruptedIOException) {
            throw AppError(AppErrorCode.TIMEOUT, detail = "Timeout after $timeoutMs ms", cause = e)
        }
        val body = withContext(Dispatchers.IO) { response.use { it.body?.string().orEmpty() } }
        if (!response.isSuccessful && !allowHttpErrors) throw HttpError(response.code, url)
        return HttpResponse(response.code, body)
    }
}

private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) = cont.resume(response)
        override fun onFailure(call: Call, e: IOException) {
            if (!cont.isCancelled) cont.resumeWithException(e)
        }
    })
}

/** One way of downloading a URL's body as text. */
typealias DownloadAttempt = suspend (url: String) -> String

/**
 * Tries each attempt in order until one returns a non-empty body that [parse] accepts.
 * A parse error also moves on to the next attempt.
 */
suspend fun <T> fetchWithFallback(
    url: String,
    parse: (String) -> T,
    attempts: List<DownloadAttempt>,
    onAttemptFailed: (String) -> Unit = {},
): T {
    for (attempt in attempts) {
        try {
            val text = attempt(url).trim()
            if (text.isEmpty()) throw IllegalStateException("Empty response")
            return parse(text)
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            onAttemptFailed(e.message ?: e.javaClass.simpleName)
        }
    }
    throw AppError(AppErrorCode.DOWNLOAD_FAILED, detail = "All download attempts failed for $url")
}
