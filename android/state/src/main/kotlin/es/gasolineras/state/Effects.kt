package es.gasolineras.state

import es.gasolineras.core.domain.HistoryWindowDay
import es.gasolineras.core.domain.computeProvinceStaleness
import es.gasolineras.core.domain.daysBefore
import es.gasolineras.core.domain.requiredHistoryDays
import es.gasolineras.core.domain.toMitecoDate
import es.gasolineras.data.miteco.MitecoSource
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.concurrent.atomic.AtomicInteger

/**
 * Async work that reads services and writes the store: loading provinces and checking price
 * history. Port of state/effects.ts. History checks run in [scope] in the background.
 */
class Effects(
    private val store: Store<AppState>,
    private val miteco: MitecoSource,
    private val scope: CoroutineScope,
    private val today: () -> LocalDate = LocalDate::now,
) {
    private val nextJobId = AtomicInteger(1)

    private fun requiredDays() = requiredHistoryDays(store.value.preferences.ageFilter)

    /** Registers the job right away (so the indicator shows "loading"), then runs it in the background. */
    private fun startHistoryCheck(province: String, days: Int): Job {
        val id = nextJobId.getAndIncrement()
        store.update { it.startHistoryJob(id, HistoryJob(province, days)) }
        return scope.launch {
            val date = today()
            val window = (1..days).map { HistoryWindowDay(it, toMitecoDate(daysBefore(date, it))) }
            try {
                // A missing day only shortens the comparison; it doesn't fail the check.
                val history = coroutineScope {
                    window.map { day ->
                        async {
                            try {
                                miteco.getHistoryDay(province, day.date)
                            } catch (e: CancellationException) {
                                throw e
                            } catch (e: Exception) {
                                null
                            }
                        }
                    }.awaitAll()
                }
                val stations = store.value.stations.filter { it.station.provinceCode == province }.map { it.station }
                val result = computeProvinceStaleness(stations, window, history, toMitecoDate(date))
                store.update { it.finishHistoryJob(id, result) }
            } catch (e: CancellationException) {
                store.update { it.finishHistoryJob(id, null) }
                throw e
            } catch (e: Exception) {
                store.update { it.finishHistoryJob(id, null) }
            }
        }
    }

    /**
     * Loads a province's stations into the store (replacing existing ones when [force]), then starts
     * the history check the current age filter needs. Throws if the download fails.
     */
    suspend fun loadProvince(province: String, force: Boolean = false) {
        val stations = miteco.getProvinceStations(province, force)
        store.update { it.markProvinceLoaded(province).addStations(stations, replace = force) }
        startHistoryCheck(province, requiredDays())
    }

    /** Compares today's prices with the last [days] days and stores how long each price has been unchanged. */
    suspend fun checkHistory(province: String, days: Int) = startHistoryCheck(province, days).join()

    /** Runs deeper history checks where the current age filter needs more days than were checked. */
    suspend fun ensureHistoryForFilter() {
        val needed = requiredDays()
        for (province in store.value.loadedProvinces) {
            val s = store.value
            val covered = (listOf(s.historyDepth[province] ?: 0) + s.historyJobs.values.filter { it.province == province }.map { it.days }).max()
            if (needed > covered) checkHistory(province, needed)
        }
    }
}
