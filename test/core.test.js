import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'wapm-'));
process.env.USE_CENSUS_GEOCODER = 'false';

const { countyFromCity, countyFromZip } = await import('../src/counties.js');
const { extractListings, parseMoney } = await import('../src/extract.js');
const { writeRows, readAllRows, exportXlsx } = await import('../src/sink.js');
const { parseCensusResponse, resolveCounty } = await import('../src/geo.js');
const { parseExport, groupIntoPosts } = await import('../src/import-chat.js');
const { processPost, zoneFlag } = await import('../src/pipeline.js');
const { addressKey } = await import('../src/store.js');

test('ciudad -> condado', () => {
  assert.equal(countyFromCity('Ft. Lauderdale').county, 'Broward');
  assert.equal(countyFromCity('WEST PALM BEACH, FL').county, 'Palm Beach');
  assert.equal(countyFromCity('Hobe Sound').county, 'Martin');
  assert.equal(countyFromCity('Miami').county, 'Miami-Dade');
  assert.equal(countyFromCity('Orlando').county, 'Orange');
  assert.equal(countyFromCity('Springfield').county, null);
  assert.equal(countyFromCity('Jupiter').ambiguous, true);
});

test('respuesta del Census geocoder', () => {
  const json = { result: { addressMatches: [{
    matchedAddress: '1234 NW 5TH AVE, FORT LAUDERDALE, FL, 33311',
    coordinates: { x: -80.15, y: 26.13 },
    addressComponents: { zip: '33311', state: 'FL' },
    geographies: { Counties: [{ NAME: 'Broward County', BASENAME: 'Broward' }] },
  }] } };
  const r = parseCensusResponse(json);
  assert.equal(r.county, 'Broward');
  assert.equal(r.zip, '33311');
  assert.equal(parseCensusResponse({ result: { addressMatches: [] } }), null);
});

test('condado offline: ZIP primero, luego ciudad; Census solo si se habilita', async () => {
  assert.equal(countyFromZip('33062').county, 'Broward');
  assert.equal(countyFromZip('34997').county, 'Martin');
  assert.equal(countyFromZip('33469').ambiguous, true);
  const noNet = async () => { throw new Error('no debería llamar a internet'); };
  const r1 = await resolveCounty({ street_address: '1 Main St', city: 'Stuart', zip: '33311' }, { fetchImpl: noNet });
  assert.equal(r1.county, 'Broward'); // ZIP gana...
  assert.equal(r1.ambiguous, true); // ...pero ZIP y ciudad no coinciden: revisar
  const r2 = await resolveCounty({ street_address: '1 Main St', city: 'Stuart' }, { fetchImpl: noNet });
  assert.equal(r2.method, 'city_table');
  const failing = async () => { throw new Error('network'); };
  const r3 = await resolveCounty({ street_address: '1 Main St', city: 'Jupiter' }, { useCensus: true, fetchImpl: failing });
  assert.equal(r3.county, 'Palm Beach'); // si el Census falla, se queda con la tabla
});

test('dinero', () => {
  assert.equal(parseMoney('325', 'k'), 325000);
  assert.equal(parseMoney('1.2', 'M'), 1200000);
  assert.equal(parseMoney('325,000'), 325000);
});

const ex = async (text) => extractListings({ text }, { ocr: false });

test('extracción: anuncio en inglés completo', async () => {
  const r = await ex(`CASH BUYERS ONLY - Wholesale deal
📍 4521 SE MURRAY ST, STUART FL 34997
4 bed 2 bath, 1,980 sf, lot 10,000 sqft, built 1978
Price: $389,000 / ARV: $525K
Repairs ~$60k. EMD $10k
Contact Mike 772.555.0199 mike@deals.com
https://www.zillow.com/homedetails/4521-SE-Murray-St`);
  assert.equal(r.is_property_listing, true);
  const [l] = r.listings;
  assert.equal(l.street_address, '4521 SE Murray St');
  assert.equal(l.city, 'Stuart');
  assert.equal(l.zip, '34997');
  assert.equal(l.address_status, 'complete');
  assert.equal(l.price_usd, 389000);
  assert.equal(l.arv_usd, 525000);
  assert.deepEqual([l.beds, l.baths, l.sqft, l.lot_sqft, l.year_built], [4, 2, 1980, 10000, 1978]);
  assert.equal(l.deal_type, 'wholesale');
  assert.equal(l.contact_name, 'Mike');
  assert.equal(l.contact_phone, '(772) 555-0199');
  assert.equal(l.contact_email, 'mike@deals.com');
  assert.equal(l.portal_links.length, 1);
});

test('extracción: formato 3/2, precio con k, link de fotos', async () => {
  const [l] = (await ex(`🔥 OFF MARKET 🔥
1234 NW 5th Ave, Fort Lauderdale, FL 33311
3/2 | 1,450 sqft | Needs rehab
Asking $325k  ARV $480k
Fotos: https://photos.app.goo.gl/abc123
Call/Text 561-555-0101`)).listings;
  assert.deepEqual([l.street_address, l.city, l.zip], ['1234 NW 5th Ave', 'Fort Lauderdale', '33311']);
  assert.deepEqual([l.price_usd, l.arv_usd, l.beds, l.baths, l.sqft], [325000, 480000, 3, 2, 1450]);
  assert.equal(l.deal_type, 'off_market');
  assert.equal(l.condition, 'needs rehab');
  assert.deepEqual(l.photo_links, ['https://photos.app.goo.gl/abc123']);
});

test('extracción: español sin dirección (parcial) y fuera de zona', async () => {
  const [l] = (await ex('Se vende casa en Miami, 3 hab 2 baños, $520,000 precio negociable')).listings;
  assert.equal(l.address_status, 'partial');
  assert.equal(l.city, 'Miami');
  assert.deepEqual([l.beds, l.baths, l.price_usd, l.property_type], [3, 2, 520000, 'single_family']);
});

test('extracción: varias propiedades en un mensaje', async () => {
  const r = await ex(`Two deals today:
1) 820 Lake Ave, Lake Worth Beach 33460 - 3/1 - $299k
2) 1500 S Ocean Blvd Unit 1203, Boca Raton, FL 33432 condo 2/2 $650,000`);
  assert.equal(r.listings.length, 2);
  assert.deepEqual(r.listings.map((l) => l.price_usd), [299000, 650000]);
  assert.equal(r.listings[1].street_address, '1500 S Ocean Blvd Unit 1203');
  assert.equal(r.listings[0].property_type, 'unknown');
  assert.equal(r.listings[1].property_type, 'condo');
});

test('extracción: charla y preguntas no son anuncios; renta mencionada no cambia el tipo', async () => {
  assert.equal((await ex('Buenas tardes a todos!')).is_property_listing, false);
  assert.equal((await ex('Who has buyers in Port St Lucie? Need something under $300k')).is_property_listing, false);
  const [l] = (await ex('Townhome in Weston, 3/2.5, asking 715k, rent $3,500/mo')).listings;
  assert.deepEqual([l.price_usd, l.baths, l.property_type, l.deal_type], [715000, 2.5, 'townhouse', 'unknown']);
});

test('OCR local de un flyer (sin internet)', { timeout: 120000 }, async () => {
  const r = await extractListings({ text: '', images: [{ path: new URL('./fixtures/flyer.png', import.meta.url).pathname }] }, { ocr: true });
  (await import('../src/ocr.js')).closeOcr();
  const [l] = r.listings;
  assert.equal(l.street_address, '2750 NE 15th St');
  assert.equal(l.zip, '33062');
  assert.equal(l.price_usd, 410000);
});

test('salida local: JSONL + CSV + Excel', async () => {
  await writeRows([{ fecha_mensaje: 't', en_zona: 'SI', direccion: '1 Main St', precio_usd: 100000, imagenes_locales: [] }]);
  const rows = await readAllRows();
  assert.ok(rows.length >= 1);
  const file = await exportXlsx();
  assert.ok(file && (await fs.stat(file)).size > 0);
});

test('zona objetivo', () => {
  assert.equal(zoneFlag('Broward', false), 'SI');
  assert.equal(zoneFlag('Miami-Dade', false), 'NO');
  assert.equal(zoneFlag(null, false), 'REVISAR');
  assert.equal(zoneFlag('Palm Beach', true), 'REVISAR');
});

test('parser de chat exportado (iOS) y agrupación por autor', async () => {
  const raw = await fs.readFile(new URL('./fixtures/chat-ios.txt', import.meta.url), 'utf8');
  const msgs = parseExport(raw);
  assert.equal(msgs.length, 5);
  assert.equal(msgs[1].sender, 'Carlos Wholesale');
  assert.match(msgs[1].text, /Call\/Text 561-555-0101/);
  assert.equal(msgs[3].date.getHours(), 14);
  const posts = groupIntoPosts(msgs, 90);
  assert.equal(posts.length, 4); // texto + foto de Carlos se unen
  assert.equal(posts[1].parts.length, 2);
});

test('parser formato Android', () => {
  const msgs = parseExport('10/2/26, 8:05 PM - Ana: Casa en Weston $900k\nsegunda línea');
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].date.getHours(), 20);
  assert.match(msgs[0].text, /segunda línea/);
});

test('normalización de direcciones para duplicados', () => {
  const a = addressKey({ street_address: '1234 Northwest 5th Avenue', zip: '33311' });
  const b = addressKey({ street_address: '1234 NW 5th Ave.', zip: '33311' });
  assert.equal(a, b);
  assert.equal(addressKey({ street_address: null, city: 'Weston' }), null);
});

test('pipeline completo con extracción simulada y detección de duplicados', async () => {
  const listing = {
    street_address: '1234 NW 5th Ave', city: 'Fort Lauderdale', state: 'FL', zip: '33311',
    address_status: 'complete', price_usd: 325000, arv_usd: 480000, beds: 3, baths: 2, sqft: 1450,
    lot_sqft: null, year_built: null, property_type: 'single_family', deal_type: 'off_market',
    condition: 'needs rehab', contact_name: null, contact_phone: '561-555-0101', contact_email: null,
    photo_links: ['https://photos.app.goo.gl/abc123'], portal_links: [], summary: 'SFH off-market en Fort Lauderdale',
  };
  const deps = {
    extract: async () => ({ is_property_listing: true, listings: [listing] }),
    geocode: async () => ({ county: 'Broward', method: 'census_geocoder', matchedAddress: '1234 NW 5TH AVE, FORT LAUDERDALE, FL, 33311', ambiguous: false }),
  };
  const [row] = await processPost({ id: 'm1', timestamp: 't1', groupName: 'G1', sender: 'Carlos', text: 'x' }, deps);
  assert.equal(row.en_zona, 'SI');
  assert.equal(row.estado_direccion, 'COMPLETA');
  assert.equal(row.duplicado, 'NO');
  const [dup] = await processPost({ id: 'm2', timestamp: 't2', groupName: 'G2', sender: 'Otro', text: 'x' }, deps);
  assert.match(dup.duplicado, /^SI/);

  const none = await processPost({ id: 'm3', text: 'hola' }, { extract: async () => ({ is_property_listing: false, listings: [] }) });
  assert.deepEqual(none, []);
});
