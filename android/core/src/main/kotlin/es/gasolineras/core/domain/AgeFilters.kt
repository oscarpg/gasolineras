package es.gasolineras.core.domain

import kotlin.math.max
import kotlin.math.min

/** History is always fetched at least this many days back. */
const val MIN_HISTORY_DAYS = 4

/** …and never more than this (MITECO history requests are one per day). */
const val MAX_HISTORY_DAYS = 10

/**
 * Whether a station whose price has been unchanged for [daysStale] days passes the filter.
 * Unknown staleness (history not loaded yet) always passes, so stations don't flicker out.
 */
fun matchesAgeFilter(daysStale: Int?, filter: AgeFilter): Boolean {
    if (daysStale == null) return true
    return when (filter) {
        AgeFilter.All -> true
        is AgeFilter.AtMost -> daysStale <= filter.days
        is AgeFilter.Exactly -> daysStale == filter.days
        is AgeFilter.MoreThan -> daysStale > filter.days
    }
}

/**
 * How many past days of history are needed to evaluate the filter: one more than the
 * threshold (to tell "N days" from "more than N"), clamped to [MIN_HISTORY_DAYS]..[MAX_HISTORY_DAYS].
 */
fun requiredHistoryDays(filter: AgeFilter): Int {
    val days = when (filter) {
        AgeFilter.All -> return MIN_HISTORY_DAYS
        is AgeFilter.AtMost -> filter.days
        is AgeFilter.Exactly -> filter.days
        is AgeFilter.MoreThan -> filter.days
    }
    return max(MIN_HISTORY_DAYS, min(MAX_HISTORY_DAYS, days + 1))
}

/**
 * The choices offered in the age-filter menu, in display order. [id] is what preferences store
 * (same ids as the web app). Custom options use the user's "X days" value.
 */
enum class AgeFilterOption(val id: String, private val build: (customDays: Int) -> AgeFilter, val isCustom: Boolean = false) {
    ALL("all", { AgeFilter.All }),
    UPDATED_TODAY("updatedToday", { AgeFilter.AtMost(0) }),
    AT_MOST_1("atMost1", { AgeFilter.AtMost(1) }),
    AT_MOST_2("atMost2", { AgeFilter.AtMost(2) }),
    AT_MOST_3("atMost3", { AgeFilter.AtMost(3) }),
    AT_MOST_CUSTOM("atMostCustom", { AgeFilter.AtMost(it) }, isCustom = true),
    EXACTLY_1("exactly1", { AgeFilter.Exactly(1) }),
    EXACTLY_2("exactly2", { AgeFilter.Exactly(2) }),
    MORE_THAN_3("moreThan3", { AgeFilter.MoreThan(3) }),
    MORE_THAN_CUSTOM("moreThanCustom", { AgeFilter.MoreThan(it) }, isCustom = true),
    ;

    /** The filter this option stands for; [customDays] is used by the custom options. */
    fun toFilter(customDays: Int): AgeFilter = build(customDays)

    companion object {
        fun fromId(id: String?): AgeFilterOption? = entries.firstOrNull { it.id == id }

        /** Values stored by web preferences v1/v2 (Spanish codes of the original select). */
        val LEGACY_VALUES: Map<String, AgeFilterOption> = mapOf(
            "TODAS" to ALL,
            "0" to UPDATED_TODAY,
            "1" to AT_MOST_1,
            "2" to AT_MOST_2,
            "3" to AT_MOST_3,
            "MAX_X" to AT_MOST_CUSTOM,
            "EXACTO_1" to EXACTLY_1,
            "EXACTO_2" to EXACTLY_2,
            "MAS_3" to MORE_THAN_3,
            "MAS_X" to MORE_THAN_CUSTOM,
        )
    }
}
