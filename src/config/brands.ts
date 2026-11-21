/**
 * Brands recognised inside a station's "Rótulo" (sign text).
 * Order matters: the first match wins, so put more specific names first
 * when two could match the same sign.
 */
export const KNOWN_BRANDS: readonly string[] = [
  'REPSOL',
  'MOEVE',
  'CEPSA',
  'CARBUGAL',
  'GALP',
  'BP',
  'SHELL',
  'PLENOIL',
  'PLENERGY',
  'BALLENOIL',
  'PETROPRIX',
  'PETROCASH',
  'SBC',
  'ORTIGAL',
  'STAROIL',
  'VALCARCE',
  'GALURESA',
  'EROSKI',
  'CARREFOUR',
  'ALCAMPO',
  'BONAREA',
  'BONÀREA',
  'AVIA',
  'Q8',
  'PETRONOR',
  'CAMPSA',
  'DISA',
  'MEROIL',
  'BEROIL',
  'AUTONETOIL',
  'EASYGAS',
  'GAS EXPRESS',
  'GASEXPRESS',
  'OILPRIX',
  'COSTCO',
  'MAKRO',
  'LECLERC',
  'HAFESA',
  'AGLA',
  'MAXOIL',
  'FARRUCO',
  'IDS',
  'AS24',
  'DYNEFF',
  'TAMOIL',
  'AN ENERGETICOS',
];

/** Spellings that should be reported under another canonical name. */
export const BRAND_ALIASES: Readonly<Record<string, string>> = {
  BONÀREA: 'BONAREA',
};

/** Name used when a sign has no recognisable text. */
export const UNBRANDED = 'SIN MARCA';
