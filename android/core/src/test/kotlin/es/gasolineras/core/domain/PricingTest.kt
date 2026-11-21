package es.gasolineras.core.domain

import es.gasolineras.core.domain.DiscountType.CTS
import es.gasolineras.core.domain.DiscountType.PCT
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PricingTest {
    @Test fun `returns null when there is no base price`() {
        assertNull(effectivePrice(null))
        assertNull(effectivePrice(null, Discount(CTS, 5.0)))
    }

    @Test fun `returns the base price without a valid discount`() {
        assertEquals(1.459, effectivePrice(1.459)!!, 0.0)
        assertEquals(1.459, effectivePrice(1.459, null)!!, 0.0)
        assertEquals(1.459, effectivePrice(1.459, Discount(CTS, 0.0))!!, 0.0)
        assertEquals(1.459, effectivePrice(1.459, Discount(PCT, -3.0))!!, 0.0)
    }

    @Test fun `subtracts cents per litre`() {
        assertEquals(1.409, effectivePrice(1.459, Discount(CTS, 5.0))!!, 0.0)
        assertEquals(1.434, effectivePrice(1.459, Discount(CTS, 2.5))!!, 0.0)
    }

    @Test fun `subtracts a percentage, rounded to 3 decimals`() {
        assertEquals(1.455, effectivePrice(1.5, Discount(PCT, 3.0))!!, 0.0)
        assertEquals(1.415, effectivePrice(1.459, Discount(PCT, 3.0))!!, 0.0)
    }

    @Test fun `never goes below zero`() = assertEquals(0.0, effectivePrice(0.03, Discount(CTS, 5.0))!!, 0.0)

    private val car = SimpleCarSpecs(tankLitres = 50.0, consumptionL100km = 6.0)

    @Test fun `without a car, only reports the round trip`() {
        assertEquals(CostBreakdown(8.0, null, null, null, null), costBreakdown(1.5, 4.0, null))
        assertNull(costBreakdown(1.5, null, null).roundTripKm)
    }

    @Test fun `without a price, reports nothing but the round trip`() {
        assertNull(costBreakdown(null, 4.0, car).totalCost)
        assertEquals(8.0, costBreakdown(null, 4.0, car).roundTripKm!!, 0.0)
    }

    @Test fun `adds the cost of driving there and back to a full tank`() {
        val r = costBreakdown(1.5, 10.0, car)
        assertEquals(20.0, r.roundTripKm!!, 0.0)
        assertEquals(75.0, r.tankCost!!, 1e-9)
        assertEquals(1.2, r.tripLitres!!, 1e-9)
        assertEquals(1.8, r.tripCost!!, 1e-9)
        assertEquals(76.8, r.totalCost!!, 1e-9)
    }

    @Test fun `treats an unknown distance as 0 km when there is a car`() {
        val r = costBreakdown(1.5, null, car)
        assertEquals(0.0, r.roundTripKm!!, 0.0)
        assertEquals(0.0, r.tripCost!!, 0.0)
        assertEquals(75.0, r.totalCost!!, 1e-9)
    }

    @Test fun `a cheaper but farther station loses when the trip costs more than it saves`() {
        val near = costBreakdown(1.5, 1.0, car).totalCost!!
        val far = costBreakdown(1.48, 20.0, car).totalCost!!
        assertTrue(far > near)
    }
}
