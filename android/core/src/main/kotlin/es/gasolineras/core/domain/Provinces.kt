package es.gasolineras.core.domain

import es.gasolineras.core.config.MAX_PROVINCE_CODE
import es.gasolineras.core.config.MIN_PROVINCE_CODE
import es.gasolineras.core.config.PROVINCE_CODES

/**
 * Works out the 2-digit province code for an address.
 *
 * Spanish postcodes start with the province code, so the postcode is tried first.
 * Falls back to matching the province (or region) name. Returns null if neither works.
 */
fun provinceCodeFromAddress(postcode: String? = null, province: String? = null, state: String? = null): String? {
    if (!postcode.isNullOrEmpty()) {
        val code = postcode.trim().padStart(5, '0').take(2)
        val n = code.toIntOrNull()
        if (n != null && n in MIN_PROVINCE_CODE..MAX_PROVINCE_CODE) return code
    }
    val name = (province?.takeIf { it.isNotEmpty() } ?: state.orEmpty()).lowercase().trim()
    return PROVINCE_CODES.firstOrNull { (provinceName, _) -> provinceName in name }?.second
}
