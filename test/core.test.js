import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'wapm-'));
process.env.GOOGLE_SHEET_ID = '';

const { countyFromCity } = await import('../src/counties.js');
const { parseCensusResponse, resolveCounty } = await import('../src/geo.js');
const { parseExport, groupIntoPosts } = await import('../src/import-chat.js');
const { processPost, zoneFlag } = await import('../src/pipeline.js');
const { addressKey } = await import('../src/store.js');

test('ciudad -> condado', () => {
  assert.equal(countyFromCity('Ft. Lauderdale').county, 'Broward');
  assert.equal(countyFromCity('WEST PALM BEACH, FL').county, 'Palm Beach');
  assert.equal(countyFromCity('Hobe Sound').county, 'Martin');
  assert.equal(countyFromCity('Miami').county, null);
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

test('si el geocoder falla se usa la tabla de ciudades', async () => {
  const failing = async () => { throw new Error('network'); };
  const r = await resolveCounty({ street_address: '1 Main St', city: 'Stuart', state: 'FL' }, { fetchImpl: failing });
  assert.equal(r.county, 'Martin');
  assert.equal(r.method, 'city_table');
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
