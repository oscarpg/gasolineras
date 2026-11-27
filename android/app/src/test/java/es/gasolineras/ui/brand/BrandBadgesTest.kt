package es.gasolineras.ui.brand

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class BrandBadgesTest {
    @Test fun `initials use up to two letters, or one per word`() {
        assertEquals("RE", brandInitials("REPSOL"))
        assertEquals("GE", brandInitials("GAS EXPRESS"))
        assertEquals("Q8", brandInitials("Q8"))
        assertEquals("", brandInitials("SIN MARCA"))
    }

    @Test fun `brands with a logo get it, the rest get initials`() {
        assertNotNull(BrandBadges.logo("REPSOL"))
        assertNull(BrandBadges.logo("PLENOIL"))
        assertNull(BrandBadges.badge("PLENOIL").logo)
        assertEquals("PL", BrandBadges.badge("PLENOIL").initials)
    }

    @Test fun `one badge instance per brand`() {
        assertSame(BrandBadges.badge("REPSOL"), BrandBadges.badge("REPSOL"))
    }
}
