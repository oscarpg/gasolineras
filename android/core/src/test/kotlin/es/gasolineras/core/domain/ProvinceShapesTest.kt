package es.gasolineras.core.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProvinceShapesTest {
    private val shapes = ProvinceShapes.bundled

    @Test fun `bundles all 52 provinces`() = assertEquals((1..52).map { "%02d".format(it) }, shapes.codes)

    @Test fun `finds the province of well-known places`() {
        assertEquals("28", shapes.provinceAt(LatLng(40.4168, -3.7038))) // Puerta del Sol, Madrid
        assertEquals("15", shapes.provinceAt(LatLng(43.3623, -8.4115))) // A Coruña
        assertEquals("08", shapes.provinceAt(LatLng(41.3874, 2.1686))) // Barcelona
        assertEquals("41", shapes.provinceAt(LatLng(37.3891, -5.9845))) // Sevilla
        assertEquals("07", shapes.provinceAt(LatLng(39.5696, 2.6502))) // Palma (island)
        assertEquals("38", shapes.provinceAt(LatLng(28.4636, -16.2518))) // Santa Cruz de Tenerife
        assertEquals("51", shapes.provinceAt(LatLng(35.8894, -5.3213))) // Ceuta
        assertEquals("45", shapes.provinceAt(LatLng(39.8628, -4.0273))) // Toledo
    }

    @Test fun `places outside Spain have no province`() {
        assertNull(shapes.provinceAt(LatLng(38.7223, -9.1393))) // Lisboa
        assertNull(shapes.provinceAt(LatLng(38.5, 5.5))) // open Mediterranean (40.0, 4.0 would be Menorca)
        assertNull(shapes.provinceAt(LatLng(48.8566, 2.3522))) // Paris
    }

    @Test fun `the user's own province comes first, then neighbours within the radius`() {
        // Aranjuez (Madrid) is ~5 km from Toledo province
        val aranjuez = LatLng(40.0333, -3.6033)
        val near = shapes.provincesWithin(aranjuez, 15.0)
        assertEquals("28", near.first())
        assertTrue("45" in near)
        assertFalse("19" in near) // Guadalajara is ~40 km away
        assertEquals(listOf("28"), shapes.provincesWithin(LatLng(40.4168, -3.7038), 15.0)) // Madrid centre
    }

    @Test fun `a long route meets every province it crosses, in order`() {
        // Straight line Madrid → Zaragoza (crosses Guadalajara and Soria)
        val madrid = LatLng(40.4168, -3.7038)
        val zaragoza = LatLng(41.6488, -0.8891)
        val route = (0..100).map { i -> LatLng(madrid.lat + (zaragoza.lat - madrid.lat) * i / 100, madrid.lon + (zaragoza.lon - madrid.lon) * i / 100) }
        val along = shapes.provincesAlongRoute(route, detourKm = 3.0)
        assertEquals("28", along.first())
        assertTrue(along.containsAll(listOf("19", "50")))
        assertTrue(along.indexOf("19") < along.indexOf("50"))
        assertFalse("08" in along)
    }

    @Test fun `parses the text format`() {
        val s = ProvinceShapes.parse("# comment\n99|0,0;1,0;1,1;0,1;0,0\n")
        assertEquals("99", s.provinceAt(LatLng(0.5, 0.5)))
        assertNull(s.provinceAt(LatLng(2.0, 2.0)))
    }
}
