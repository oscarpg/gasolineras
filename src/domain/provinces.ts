import { MAX_PROVINCE_CODE, MIN_PROVINCE_CODE, PROVINCE_CODES } from '../config/provinces';

/** The address fields this module reads (a subset of Nominatim's `address`). */
export interface AddressLike {
  postcode?: string | number;
  province?: string;
  state?: string;
}

/**
 * Works out the 2-digit province code for an address.
 *
 * Spanish postcodes start with the province code, so the postcode is tried first.
 * Falls back to matching the province (or region) name. Returns `null` if neither works.
 */
export function provinceCodeFromAddress(address: AddressLike = {}): string | null {
  if (address.postcode) {
    const code = String(address.postcode).trim().padStart(5, '0').slice(0, 2);
    const n = Number(code);
    if (n >= MIN_PROVINCE_CODE && n <= MAX_PROVINCE_CODE) return code;
  }

  const name = (address.province || address.state || '').toLowerCase().trim();
  for (const [provinceName, code] of Object.entries(PROVINCE_CODES)) {
    if (name.includes(provinceName)) return code;
  }
  return null;
}
