// Tabla de respaldo ciudad -> condado para cuando el geocodificador no encuentra la dirección.
// Incluye municipios y nombres postales/no incorporados frecuentes en los anuncios.

const PALM_BEACH = [
  'atlantis', 'belle glade', 'boca raton', 'boynton beach', 'briny breezes', 'cloud lake',
  'delray beach', 'glen ridge', 'golf', 'greenacres', 'gulf stream', 'haverhill',
  'highland beach', 'hypoluxo', 'juno beach', 'jupiter', 'jupiter inlet colony',
  'lake clarke shores', 'lake park', 'lake worth', 'lake worth beach', 'lantana',
  'loxahatchee', 'loxahatchee groves', 'manalapan', 'mangonia park', 'north palm beach',
  'ocean ridge', 'pahokee', 'palm beach', 'palm beach gardens', 'palm beach shores',
  'palm springs', 'riviera beach', 'royal palm beach', 'south bay', 'south palm beach',
  'wellington', 'westlake', 'west palm beach', 'canal point', 'jupiter farms',
  'the acreage', 'acreage', 'lake harbor', 'boca', 'wpb',
];

const BROWARD = [
  'coconut creek', 'cooper city', 'coral springs', 'dania beach', 'dania', 'davie',
  'deerfield beach', 'fort lauderdale', 'hallandale beach', 'hallandale', 'hillsboro beach',
  'hollywood', 'lauderdale by the sea', 'lauderdale lakes', 'lauderhill', 'lazy lake',
  'lighthouse point', 'margate', 'miramar', 'north lauderdale', 'oakland park', 'parkland',
  'pembroke park', 'pembroke pines', 'plantation', 'pompano beach', 'pompano',
  'sea ranch lakes', 'southwest ranches', 'sunrise', 'tamarac', 'west park', 'weston',
  'wilton manors', 'broadview park', 'roosevelt gardens', 'boulevard gardens', 'flamingo lakes',
];

const MARTIN = [
  'stuart', 'jupiter island', 'ocean breeze', 'sewalls point', 'hobe sound', 'palm city',
  'jensen beach', 'port salerno', 'indiantown', 'rio', 'north river shores',
  'hutchinson island', 'golden gate', 'port mayaca',
];

// Nombres que cruzan la frontera entre condados: requieren geocodificar para confirmar.
const AMBIGUOUS = new Set(['tequesta', 'jupiter', 'hutchinson island', 'golden gate']);

const TABLE = new Map();
for (const c of PALM_BEACH) TABLE.set(c, 'Palm Beach');
for (const c of BROWARD) TABLE.set(c, 'Broward');
for (const c of MARTIN) TABLE.set(c, 'Martin');
TABLE.set('tequesta', 'Palm Beach');

export function normalizeCity(city) {
  return (city || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(ft|ft\.)\s/g, 'fort ')
    .replace(/[.'’,-]/g, ' ')
    .replace(/\b(fl|florida)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @returns {{county: string|null, ambiguous: boolean}} */
export function countyFromCity(city) {
  const key = normalizeCity(city);
  if (!key) return { county: null, ambiguous: false };
  return { county: TABLE.get(key) ?? null, ambiguous: AMBIGUOUS.has(key) };
}

/** "Palm Beach County" -> "Palm Beach" */
export function cleanCountyName(name) {
  return (name || '').replace(/\s+county$/i, '').trim() || null;
}
