import { config } from './config.js';
import { extractListings } from './extract.js';
import { resolveCounty } from './geo.js';
import { loadState, addressKey } from './store.js';

const ADDRESS_STATUS = { complete: 'COMPLETA', partial: 'PARCIAL', missing: 'SIN DIRECCION' };

export function zoneFlag(county, ambiguous) {
  if (!county) return 'REVISAR';
  const inTarget = config.targetCounties.some((t) => t.toLowerCase() === county.toLowerCase());
  if (ambiguous) return inTarget ? 'REVISAR' : 'NO';
  return inTarget ? 'SI' : 'NO';
}

/**
 * Procesa una publicación cruda y devuelve las filas a escribir.
 * @param {{id, timestamp, groupName, sender, text, images}} post
 * @param {{extract?: Function, geocode?: Function}} deps  (inyectables para pruebas)
 */
export async function processPost(post, deps = {}) {
  const extract = deps.extract || extractListings;
  const geocode = deps.geocode || resolveCounty;
  const state = await loadState();
  const now = new Date().toISOString();

  if (post.id && state.seenMessageIds[post.id]) return [];

  const result = await extract(post);
  const rows = [];

  if (result.is_property_listing) {
    for (const l of result.listings) {
      const geo = await geocode(l);
      const key = addressKey(l, geo);
      let first = key ? state.addresses[key] : null;
      if (key && !first) state.addresses[key] = { at: post.timestamp, group: post.groupName, id: post.id };
      if (first && first.id === post.id) first = null; // reintento del mismo mensaje, no es duplicado

      rows.push({
        fecha_mensaje: post.timestamp,
        grupo: post.groupName,
        autor: post.sender,
        condado: geo.county,
        en_zona: zoneFlag(geo.county, geo.ambiguous),
        estado_direccion: ADDRESS_STATUS[l.address_status],
        direccion: l.street_address,
        ciudad: l.city,
        zip: l.zip || geo.zip,
        direccion_verificada: geo.matchedAddress,
        metodo_condado: geo.method,
        precio_usd: l.price_usd,
        arv_usd: l.arv_usd,
        beds: l.beds,
        baths: l.baths,
        sqft: l.sqft,
        lote_sqft: l.lot_sqft,
        anio: l.year_built,
        tipo: l.property_type,
        tipo_negocio: l.deal_type,
        condicion: l.condition,
        contacto: l.contact_name,
        telefono: l.contact_phone,
        email: l.contact_email,
        links_fotos: l.photo_links,
        links_portales: l.portal_links,
        resumen: l.summary,
        duplicado: first ? `SI (visto ${first.at} en ${first.group})` : 'NO',
        mensaje_original: post.text,
        imagenes_locales: (post.images || []).map((i) => i.path),
        id_mensaje: post.id,
        procesado_en: now,
      });
    }
  }

  return rows;
}
