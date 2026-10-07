import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'wapm-'));
process.env.USE_CENSUS_GEOCODER = 'false';
process.env.VISTA_TOKEN = 'tok-de-prueba-123';

const { countyFromCity, countyFromZip } = await import('../src/counties.js');
const { extractListings, parseMoney } = await import('../src/extract.js');
const { exportOutputs } = await import('../src/sink.js');
const { parseCensusResponse, resolveCounty } = await import('../src/geo.js');
const { parseExport, groupIntoPosts } = await import('../src/import-chat.js');
const { processPost, classify } = await import('../src/pipeline.js');
const leadsMod = await import('../src/leads.js');
const actions = await import('../src/actions.js');
const { ESTADOS } = leadsMod;
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

test('salida local: CSV + Excel desde leads.json', async () => {
  await leadsMod.addLeads([{ estado: ESTADOS.nuevo, fecha_mensaje: 't', direccion: '1 Main St', precio_usd: 100000, imagenes_locales: [] }]);
  const file = await exportOutputs();
  assert.ok(file && (await fs.stat(file)).size > 0);
  const csv = await fs.readFile(path.join(process.env.DATA_DIR, 'propiedades.csv'), 'utf8');
  assert.match(csv, /"estado"/);
  assert.match(csv, /1 Main St/);
});

test('reglas de entrada R2-R6', () => {
  const geoB = { county: 'Broward', ambiguous: false };
  assert.deepEqual(classify({ street_address: null, arv_usd: null }, {}), { descartar: 'sin dirección ni ARV' });
  assert.equal(classify({ street_address: null, arv_usd: 400000 }, {}).estado, ESTADOS.pendienteDireccion);
  assert.match(classify({ street_address: null, arv_usd: 400000 }, {}).alerta, /wholesaler/);
  assert.equal(classify({ street_address: '1 Main St' }, geoB).estado, ESTADOS.nuevo);
  assert.equal(classify({ street_address: '1 Main St' }, { county: 'Martin' }).estado, ESTADOS.nuevo);
  assert.match(classify({ street_address: '1 Main St' }, { county: 'Miami-Dade' }).descartar, /fuera de condado/);
  assert.equal(classify({ street_address: '1 Main St' }, { county: null }).estado, ESTADOS.revisarCondado);
  assert.equal(classify({ street_address: '1 Main St' }, { county: 'Palm Beach', ambiguous: true }).estado, ESTADOS.revisarCondado);
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
  const { rows: [row] } = await processPost({ id: 'm1', timestamp: 't1', groupName: 'G1', sender: 'Carlos', text: 'x' }, deps);
  assert.equal(row.estado, ESTADOS.nuevo);
  assert.equal(row.estado_direccion, 'COMPLETA');
  assert.equal(row.duplicado, 'NO');
  assert.ok(row.clave_direccion);
  const { rows: [dup] } = await processPost({ id: 'm2', timestamp: 't2', groupName: 'G2', sender: 'Otro', text: 'x' }, deps);
  assert.match(dup.duplicado, /^SI/);

  const fuera = await processPost({ id: 'm4', text: 'x' }, { ...deps, geocode: async () => ({ county: 'Miami-Dade', ambiguous: false }) });
  assert.equal(fuera.rows.length, 0);
  assert.equal(fuera.descartes.length, 1);

  const none = await processPost({ id: 'm3', text: 'hola' }, { extract: async () => ({ is_property_listing: false, listings: [] }) });
  assert.deepEqual(none, { rows: [], descartes: [] });
});

test('acciones: descartar borra y bloquea reingreso; Tier 1 registra usuario', async () => {
  const [a, b] = await leadsMod.addLeads([
    { estado: ESTADOS.nuevo, direccion: '10 A St', clave_direccion: '10 A ST 33311' },
    { estado: ESTADOS.nuevo, direccion: '20 B St', clave_direccion: '20 B ST 33311' },
  ]);
  await actions.descartar(a.id);
  const ids = (await leadsMod.listLeads()).map((l) => l.id);
  assert.ok(!ids.includes(a.id));
  const again = await leadsMod.addLeads([{ estado: ESTADOS.nuevo, direccion: '10 A St', clave_direccion: '10 A ST 33311' }]);
  assert.equal(again.length, 0);
  // el lead descartado no deja ningún dato, solo la clave
  const raw = JSON.parse(await fs.readFile(path.join(process.env.DATA_DIR, 'leads.json'), 'utf8'));
  assert.ok(raw.descartados['10 A ST 33311']);
  assert.ok(!JSON.stringify(raw.leads).includes('10 A St'));

  await assert.rejects(actions.pasarATier1(b.id, 'Pedro'), /Usuario no válido/);
  const t1 = await actions.pasarATier1(b.id, 'Carlos');
  assert.equal(t1.skill.lanzado, false); // por habilitar
  const lead = (await leadsMod.listLeads()).find((l) => l.id === b.id);
  assert.equal(lead.estado, ESTADOS.tier1);
  assert.equal(lead.tier1_usuario, 'Carlos');
});

test('acciones: agregar dirección a un lead con ARV', async () => {
  const [p1, p2, p3] = await leadsMod.addLeads([
    { estado: ESTADOS.pendienteDireccion, arv_usd: 400000, alerta: 'x' },
    { estado: ESTADOS.pendienteDireccion, arv_usd: 400000, alerta: 'x' },
    { estado: ESTADOS.pendienteDireccion, arv_usd: 400000, alerta: 'x' },
  ]);
  await assert.rejects(actions.pasarATier1(p1.id, 'Jaime'), /Primero agrega la dirección/);
  const geo = (county, ambiguous = false) => ({ geocode: async () => ({ county, ambiguous, method: 'test' }) });

  const ok = await actions.agregarDireccion(p1.id, { calle: '500 E Ocean Ave', ciudad: 'Boynton Beach', zip: '33435' }, 'Jaime', geo('Palm Beach'));
  assert.equal(ok.resultado, 'tier1');
  const lead = (await leadsMod.listLeads()).find((l) => l.id === p1.id);
  assert.equal(lead.estado, ESTADOS.tier1);
  assert.equal(lead.direccion, '500 E Ocean Ave');
  assert.equal(lead.alerta, '');

  const out = await actions.agregarDireccion(p2.id, { calle: '1 Brickell Ave', ciudad: 'Miami' }, 'Jaime', geo('Miami-Dade'));
  assert.equal(out.resultado, 'descartado');
  assert.ok(!(await leadsMod.listLeads()).some((l) => l.id === p2.id));

  await assert.rejects(actions.agregarDireccion(p3.id, { calle: '1 Main St' }, 'Jaime', geo(null)), /No se pudo confirmar el condado/);
  await assert.rejects(actions.agregarDireccion(p3.id, { calle: '' }, 'Jaime', geo('Broward')), /número y calle/);
  assert.equal((await leadsMod.listLeads()).find((l) => l.id === p3.id).estado, ESTADOS.pendienteDireccion);
});

test('extracción: ignora comps y ventas, y la calle no cruza líneas', async () => {
  const text = [
    'N F St, Lake Worth, FL 33460', '', 'Asking: $325,000', 'ARV: $485,000+', '',
    'Comps', '211 N A St, Lake Worth, FL 33460', '$485,000', '', '1025 N H St Lake Worth, FL 33460', '$485,000',
  ].join('\n');
  const r = await extractListings({ text, images: [] }, { ocr: false });
  assert.equal(r.listings.length, 1);
  assert.equal(r.listings[0].street_address, null);
  assert.equal(r.listings[0].arv_usd, 485000);

  const t2 = '5088 2nd Rd, Lake Worth, FL 33467\nASKING: $479,900\nComps:\n5587 3rd Rd — SOLD: $699,000\nTerms: Cash';
  const r2 = await extractListings({ text: t2, images: [] }, { ocr: false });
  assert.deepEqual(r2.listings.map((l) => l.street_address), ['5088 2nd Rd']);

  const t3 = 'ASKING: $389,900\n* 2255 NW 96th St — SOLD: $540,000\n1951 NE 59th Place, Fort Lauderdale, FL 33308';
  const r3 = await extractListings({ text: t3, images: [] }, { ocr: false });
  assert.deepEqual(r3.listings.map((l) => l.street_address), ['1951 NE 59th Place']);
});

test('extracción: varias propiedades guardan solo su bloque', async () => {
  const text = '1951 NE 59th Place, Fort Lauderdale, FL 33308\nASKING: $650,000\n\n5088 2nd Rd, Lake Worth, FL 33467\nASKING: $479,900';
  const r = await extractListings({ text, images: [] }, { ocr: false });
  assert.equal(r.listings.length, 2);
  assert.doesNotMatch(r.listings[0].segment, /5088/);
  assert.match(r.listings[1].segment, /^5088 2nd Rd/);
});

test('vista de solo lectura: solo con el código, sin acciones', async () => {
  const { writeVista, startVista } = await import('../src/vista.js');
  await leadsMod.addLeads([{ estado: ESTADOS.nuevo, direccion: '77 Vista St', mensaje_original: 'texto completo', imagenes_locales: [] }]);
  await exportOutputs(); // regenera también la vista
  assert.ok(await writeVista());
  const server = startVista({ port: 0, host: '127.0.0.1' });
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${base}/v/tok-de-prueba-123/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /window\.RO=true/);
    const datos = await (await fetch(`${base}/v/tok-de-prueba-123/datos.json`)).json();
    assert.ok(datos.leads.some((l) => l.direccion === '77 Vista St' && l.mensaje_original === 'texto completo'));
    assert.equal((await fetch(`${base}/v/tok-de-prueba-123/propiedades.csv`)).status, 200);
    assert.equal((await fetch(`${base}/v/otro-codigo/`)).status, 404);
    assert.equal((await fetch(`${base}/`)).status, 404);
    assert.equal((await fetch(`${base}/api/leads`)).status, 404);
    assert.equal((await fetch(`${base}/v/tok-de-prueba-123/../leads.json`)).status, 404);
    assert.equal((await fetch(`${base}/v/tok-de-prueba-123/media/..%2Fleads.json`)).status, 404);
    assert.equal((await fetch(`${base}/v/tok-de-prueba-123/`, { method: 'POST' })).status, 404);
  } finally {
    server.close();
  }
});

test('órdenes Tier 1: pendiente -> en proceso -> listo, reflejado en el lead', async () => {
  const { lanzarCompAnalysis, listJobs } = await import('../src/tier1.js');
  const [lead] = await leadsMod.addLeads([{ estado: ESTADOS.tier1, direccion: '1951 NE 59th Place', ciudad: 'Fort Lauderdale', zip: '33308' }]);
  const r = await lanzarCompAnalysis(lead, 'Carlos', { enabled: true });
  assert.equal(r.lanzado, true);
  const [job] = (await listJobs({ estado: 'pendiente' })).filter((j) => j.id === lead.id);
  assert.equal(job.lead.direccion, '1951 NE 59th Place, Fort Lauderdale, FL 33308');
  assert.equal(job.usuario, 'Carlos');

  await actions.reportarInforme(lead.id, { estado: 'en_proceso' });
  assert.equal((await listJobs({ estado: 'pendiente' })).filter((j) => j.id === lead.id).length, 0);
  await actions.reportarInforme(lead.id, { estado: 'listo', ruta: 'C:/Leads/Informes Tier 1' });
  const updated = (await leadsMod.listLeads()).find((l) => l.id === lead.id);
  assert.equal(updated.informe_estado, 'listo');
  assert.match(updated.informe_ruta, /Informes Tier 1/);
  await assert.rejects(actions.reportarInforme(lead.id, { estado: 'otro' }), /Estado no válido/);
  await assert.rejects(actions.reportarInforme('no-existe', { estado: 'listo' }), /no encontrada/);
});
