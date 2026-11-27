package es.gasolineras.core.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class BrandsTest {
    @Test fun `finds a known brand anywhere in the sign, as a whole word`() {
        assertEquals("REPSOL", normalizeBrand("E.S. REPSOL ALCALÁ"))
        assertEquals("CEPSA", normalizeBrand("area de servicio cepsa km 23"))
        assertEquals("BP", normalizeBrand("BP OIL ESPAÑA"))
        assertEquals("ENI", normalizeBrand("ENI IBERIA"))
    }

    @Test fun `does not match a brand that is only part of a longer word`() {
        assertEquals("BPXYZ CARBURANTES", normalizeBrand("BPXYZ CARBURANTES"))
    }

    @Test fun `ignores accents and case`() {
        assertEquals("BONAREA", normalizeBrand("bonÀrea agrupa"))
        assertEquals("PETROPRIX", normalizeBrand("Petroprix Móstoles"))
    }

    @Test fun `maps alias spellings to one canonical name`() {
        assertEquals("BONAREA", normalizeBrand("BONÀREA"))
        assertEquals("BONAREA", normalizeBrand("BONAREA"))
    }

    @Test fun `respects brand priority when several match`() {
        assertEquals("REPSOL", normalizeBrand("CAMPSA - REPSOL"))
    }

    @Test fun `strips generic prefixes and keeps the text before a separator for unknown brands`() {
        assertEquals("LOS PINOS", normalizeBrand("GASOLINERA LOS PINOS - CARRETERA N-II"))
        assertEquals("EL CRUCE", normalizeBrand("ESTACION DE SERVICIO EL CRUCE / KM 4"))
        assertEquals("VALDEMORO", normalizeBrand("E.S. VALDEMORO , S.L."))
    }

    @Test fun `returns SIN MARCA for empty input`() {
        assertEquals("SIN MARCA", normalizeBrand(""))
        assertEquals("SIN MARCA", normalizeBrand("   "))
        assertEquals("SIN MARCA", normalizeBrand())
    }
}
