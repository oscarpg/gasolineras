package es.gasolineras.core.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AgeFiltersTest {
    @Test fun `all lets everything through`() {
        assertEquals(true, matchesAgeFilter(0, AgeFilter.All))
        assertEquals(true, matchesAgeFilter(9, AgeFilter.All))
    }

    @Test fun `unknown staleness always passes`() {
        assertEquals(true, matchesAgeFilter(null, AgeFilter.Exactly(1)))
        assertEquals(true, matchesAgeFilter(null, AgeFilter.MoreThan(3)))
    }

    @Test fun `atMost exactly moreThan`() {
        assertEquals(listOf(true, true, true, false), listOf(0, 1, 2, 3).map { matchesAgeFilter(it, AgeFilter.AtMost(2)) })
        assertEquals(listOf(false, true, false), listOf(0, 1, 2).map { matchesAgeFilter(it, AgeFilter.Exactly(1)) })
        assertEquals(listOf(false, true, true), listOf(3, 4, 9).map { matchesAgeFilter(it, AgeFilter.MoreThan(3)) })
    }

    @Test fun `fetches at least 4 days`() {
        assertEquals(4, requiredHistoryDays(AgeFilter.All))
        assertEquals(4, requiredHistoryDays(AgeFilter.AtMost(0)))
        assertEquals(4, requiredHistoryDays(AgeFilter.MoreThan(3)))
    }

    @Test fun `fetches one day more than the threshold, up to 10`() {
        assertEquals(6, requiredHistoryDays(AgeFilter.MoreThan(5)))
        assertEquals(10, requiredHistoryDays(AgeFilter.AtMost(9)))
        assertEquals(10, requiredHistoryDays(AgeFilter.AtMost(30)))
    }

    @Test fun `maps every option to its filter`() {
        assertEquals(AgeFilter.All, AgeFilterOption.ALL.toFilter(5))
        assertEquals(AgeFilter.AtMost(0), AgeFilterOption.UPDATED_TODAY.toFilter(5))
        assertEquals(AgeFilter.AtMost(3), AgeFilterOption.AT_MOST_3.toFilter(5))
        assertEquals(AgeFilter.AtMost(5), AgeFilterOption.AT_MOST_CUSTOM.toFilter(5))
        assertEquals(AgeFilter.Exactly(1), AgeFilterOption.EXACTLY_1.toFilter(5))
        assertEquals(AgeFilter.Exactly(2), AgeFilterOption.EXACTLY_2.toFilter(5))
        assertEquals(AgeFilter.MoreThan(3), AgeFilterOption.MORE_THAN_3.toFilter(5))
        assertEquals(AgeFilter.MoreThan(7), AgeFilterOption.MORE_THAN_CUSTOM.toFilter(7))
    }

    @Test fun `knows which options use the custom days`() {
        assertEquals(listOf("atMostCustom", "moreThanCustom"), AgeFilterOption.entries.filter { it.isCustom }.map { it.id })
    }

    @Test fun `ids match the web app and validate`() {
        assertEquals(
            listOf("all", "updatedToday", "atMost1", "atMost2", "atMost3", "atMostCustom", "exactly1", "exactly2", "moreThan3", "moreThanCustom"),
            AgeFilterOption.entries.map { it.id },
        )
        assertEquals(AgeFilterOption.MORE_THAN_3, AgeFilterOption.fromId("moreThan3"))
        assertNull(AgeFilterOption.fromId("MAS_3"))
        assertNull(AgeFilterOption.fromId(null))
    }

    @Test fun `maps every value the original select stored to an option with the same meaning`() {
        val old = mapOf(
            "TODAS" to AgeFilter.All,
            "0" to AgeFilter.AtMost(0),
            "1" to AgeFilter.AtMost(1),
            "2" to AgeFilter.AtMost(2),
            "3" to AgeFilter.AtMost(3),
            "MAX_X" to AgeFilter.AtMost(6),
            "EXACTO_1" to AgeFilter.Exactly(1),
            "EXACTO_2" to AgeFilter.Exactly(2),
            "MAS_3" to AgeFilter.MoreThan(3),
            "MAS_X" to AgeFilter.MoreThan(6),
        )
        for ((legacy, filter) in old) {
            assertEquals(legacy, filter, AgeFilterOption.LEGACY_VALUES.getValue(legacy).toFilter(6))
        }
    }
}
