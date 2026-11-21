package es.gasolineras.diagnostics

import android.view.Choreographer

data class FrameStats(
    val frames: Int,
    val durationMs: Long,
    val avgFps: Double,
    /** Share of frames that took longer than [JANK_THRESHOLD_MS]. */
    val jankyPercent: Double,
    val worstFrameMs: Double,
) {
    companion object {
        const val JANK_THRESHOLD_MS = 25.0
    }
}

/** Counts frames with [Choreographer] while the map test animates. Main thread only. */
class FrameMeter : Choreographer.FrameCallback {
    private val intervalsMs = mutableListOf<Double>()
    private var lastFrameNanos = 0L
    private var startNanos = 0L
    private var running = false

    fun start() {
        intervalsMs.clear()
        lastFrameNanos = 0L
        startNanos = System.nanoTime()
        running = true
        Choreographer.getInstance().postFrameCallback(this)
    }

    fun stop(): FrameStats {
        running = false
        Choreographer.getInstance().removeFrameCallback(this)
        return summarize(intervalsMs, (System.nanoTime() - startNanos) / 1_000_000)
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        if (lastFrameNanos != 0L) intervalsMs += (frameTimeNanos - lastFrameNanos) / 1_000_000.0
        lastFrameNanos = frameTimeNanos
        Choreographer.getInstance().postFrameCallback(this)
    }

    companion object {
        fun summarize(intervalsMs: List<Double>, durationMs: Long): FrameStats {
            if (intervalsMs.isEmpty()) return FrameStats(0, durationMs, 0.0, 0.0, 0.0)
            val total = intervalsMs.sum()
            return FrameStats(
                frames = intervalsMs.size,
                durationMs = durationMs,
                avgFps = intervalsMs.size * 1000.0 / total,
                jankyPercent = 100.0 * intervalsMs.count { it > FrameStats.JANK_THRESHOLD_MS } / intervalsMs.size,
                worstFrameMs = intervalsMs.max(),
            )
        }
    }
}
