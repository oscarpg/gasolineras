package es.gasolineras.diagnostics

import android.os.Build
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Phase 0 question: does Android's own trust store accept MITECO's certificate?
 * Runs on CI emulators (API 26 / 30 / 36). Results are also logged under [TAG]
 * so the CI job can print them.
 */
@RunWith(AndroidJUnit4::class)
class NetworkProbeTest {

    @Test
    fun mitecoCertificateIsTrusted() = runBlocking {
        val result = NetworkProbes().miteco()
        Log.i(TAG, "API ${Build.VERSION.SDK_INT} " + DiagnosticsReport.miteco(result))

        assertFalse("TLS failure on API ${Build.VERSION.SDK_INT}: ${result.http.errorMessage}", result.http.tlsError)
        // Network problems unrelated to TLS (timeouts, geo-blocking from CI) don't answer the question.
        assumeTrue("MITECO not reachable: ${result.http.errorType} ${result.http.errorMessage}", result.http.ok)
        assertTrue("No stations parsed: ${result.parseError}", result.ok)
    }

    @Test
    fun openFreeMapIsReachable() = runBlocking {
        val result = NetworkProbes().mapTiles()
        Log.i(TAG, "API ${Build.VERSION.SDK_INT} " + DiagnosticsReport.mapTiles(result))
        assertFalse("TLS failure: ${result.errorMessage}", result.tlsError)
        assumeTrue("OpenFreeMap not reachable: ${result.errorType} ${result.errorMessage}", result.ok)
    }

    private companion object {
        const val TAG = "GasolinerasDiag"
    }
}
