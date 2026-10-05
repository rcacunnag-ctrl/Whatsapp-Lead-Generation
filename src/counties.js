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

// Ciudades frecuentes de otros condados de Florida: permiten marcar "NO" con seguridad.
const OTHER_FL = {
  'Miami-Dade': ['miami', 'miami beach', 'north miami', 'north miami beach', 'hialeah', 'homestead', 'doral',
    'aventura', 'kendall', 'coral gables', 'miami gardens', 'miami lakes', 'cutler bay', 'florida city',
    'opa locka', 'sunny isles beach', 'sweetwater', 'palmetto bay', 'pinecrest', 'south miami', 'hialeah gardens'],
  'St. Lucie': ['port saint lucie', 'port st lucie', 'psl', 'fort pierce', 'saint lucie west', 'st lucie west'],
  'Indian River': ['vero beach', 'sebastian'],
  'Hendry': ['clewiston', 'labelle'],
  'Okeechobee': ['okeechobee'],
  'Orange': ['orlando', 'winter park', 'apopka', 'ocoee'],
  'Hillsborough': ['tampa', 'brandon', 'plant city'],
  'Lee': ['cape coral', 'fort myers', 'lehigh acres'],
  'Collier': ['naples', 'immokalee'],
  'Duval': ['jacksonville'],
  'Polk': ['lakeland', 'winter haven'],
  'Volusia': ['daytona beach', 'deltona'],
};

// Nombres que cruzan la frontera entre condados: requieren geocodificar para confirmar.
const AMBIGUOUS = new Set(['tequesta', 'jupiter', 'hutchinson island', 'golden gate']);

const TABLE = new Map();
for (const c of PALM_BEACH) TABLE.set(c, 'Palm Beach');
for (const c of BROWARD) TABLE.set(c, 'Broward');
for (const c of MARTIN) TABLE.set(c, 'Martin');
TABLE.set('tequesta', 'Palm Beach');
for (const [county, cities] of Object.entries(OTHER_FL)) for (const c of cities) TABLE.set(c, county);

/** Todas las ciudades conocidas, de la más larga a la más corta (para buscarlas dentro del texto). */
export const KNOWN_CITIES = [...TABLE.keys()].sort((a, b) => b.length - a.length);

// ZIP -> condado (códigos residenciales y de apartados postales de los tres condados objetivo).
const ZIPS = {
  Broward: [
    '33004', '33008', '33009', '33019', '33020', '33021', '33022', '33023', '33024', '33025', '33026', '33027',
    '33028', '33029', '33060', '33061', '33062', '33063', '33064', '33065', '33066', '33067', '33068', '33069',
    '33071', '33072', '33073', '33074', '33075', '33076', '33077', '33081', '33082', '33083', '33084', '33093',
    '33097', '33301', '33302', '33303', '33304', '33305', '33306', '33307', '33308', '33309', '33310', '33311',
    '33312', '33313', '33314', '33315', '33316', '33317', '33318', '33319', '33320', '33321', '33322', '33323',
    '33324', '33325', '33326', '33327', '33328', '33329', '33330', '33331', '33332', '33334', '33335', '33336',
    '33337', '33338', '33339', '33340', '33345', '33346', '33348', '33349', '33351', '33355', '33359', '33388',
    '33394', '33441', '33442', '33443',
  ],
  'Palm Beach': [
    '33401', '33402', '33403', '33404', '33405', '33406', '33407', '33408', '33409', '33410', '33411', '33412',
    '33413', '33414', '33415', '33416', '33417', '33418', '33419', '33420', '33421', '33422', '33424', '33425',
    '33426', '33427', '33428', '33429', '33430', '33431', '33432', '33433', '33434', '33435', '33436', '33437',
    '33438', '33444', '33445', '33446', '33448', '33449', '33454', '33458', '33459', '33460', '33461', '33462',
    '33463', '33464', '33465', '33466', '33467', '33468', '33469', '33470', '33472', '33473', '33474', '33476',
    '33477', '33478', '33480', '33481', '33482', '33483', '33484', '33486', '33487', '33488', '33493', '33496',
    '33497', '33498', '33499',
  ],
  Martin: ['33455', '33475', '34956', '34957', '34958', '34990', '34991', '34992', '34994', '34995', '34996', '34997'],
};
// ZIPs que cruzan límites de condado.
const AMBIGUOUS_ZIPS = new Set(['33469', '34957']);

const ZIP_TABLE = new Map();
for (const [county, zips] of Object.entries(ZIPS)) for (const z of zips) ZIP_TABLE.set(z, county);

/** @returns {{county: string|null, ambiguous: boolean}} */
export function countyFromZip(zip) {
  const z = String(zip || '').slice(0, 5);
  return { county: ZIP_TABLE.get(z) ?? null, ambiguous: AMBIGUOUS_ZIPS.has(z) };
}

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
