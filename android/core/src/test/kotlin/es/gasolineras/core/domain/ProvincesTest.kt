package es.gasolineras.core.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProvincesTest {
    @Test fun `uses the first two digits of the postcode`() {
        assertEquals("28", provinceCodeFromAddress(postcode = "28013"))
        assertEquals("08", provinceCodeFromAddress(postcode = "08001"))
    }

    @Test fun `pads short or numeric postcodes`() {
        assertEquals("08", provinceCodeFromAddress(postcode = "8001"))
        assertEquals("01", provinceCodeFromAddress(postcode = "1001"))
    }

    @Test fun `ignores postcodes outside 01-52 and falls back to the name`() {
        assertEquals("41", provinceCodeFromAddress(postcode = "99999", province = "Sevilla"))
        assertNull(provinceCodeFromAddress(postcode = "00000"))
    }

    @Test fun `matches province names case-insensitively, including co-official names`() {
        assertEquals("46", provinceCodeFromAddress(province = "Valencia / València"))
        assertEquals("48", provinceCodeFromAddress(province = "BIZKAIA"))
        assertEquals("15", provinceCodeFromAddress(province = "A Coruña"))
    }

    @Test fun `falls back to the state (region) when there is no province`() {
        assertEquals("28", provinceCodeFromAddress(state = "Comunidad de Madrid"))
        assertEquals("33", provinceCodeFromAddress(state = "Principado de Asturias"))
    }

    @Test fun `returns null when nothing matches`() {
        assertNull(provinceCodeFromAddress())
        assertNull(provinceCodeFromAddress(province = "Île-de-France"))
    }
}
