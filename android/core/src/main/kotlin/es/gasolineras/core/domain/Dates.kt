package es.gasolineras.core.domain

import java.time.DateTimeException
import java.time.LocalDate

/** Formats a date as MITECO expects it in URLs and bulletins: dd-mm-yyyy. */
fun toMitecoDate(date: LocalDate): String =
    "%02d-%02d-%04d".format(date.dayOfMonth, date.monthValue, date.year)

/** The day [days] days before [date]. */
fun daysBefore(date: LocalDate, days: Int): LocalDate = date.minusDays(days.toLong())

private val MITECO_DATE = Regex("""^(\d{1,2})[-/](\d{1,2})[-/](\d{4})""")

/**
 * Parses the dates MITECO uses: "dd-mm-yyyy" or "dd/mm/yyyy", optionally followed
 * by a time ("21/11/2026 9:05:12"). Returns null for invalid dates.
 */
fun parseMitecoDate(text: String): LocalDate? {
    val m = MITECO_DATE.find(text.trim()) ?: return null
    val (day, month, year) = m.destructured
    return try {
        LocalDate.of(year.toInt(), month.toInt(), day.toInt())
    } catch (e: DateTimeException) {
        null
    }
}
