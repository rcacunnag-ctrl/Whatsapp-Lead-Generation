// Acciones del usuario sobre un lead (desde el panel): descartar, pasar a Tier 1 y agregar dirección.
import { config } from './config.js';
import { ESTADOS, listLeads, updateLead, discardLead } from './leads.js';
import { resolveManualAddress } from './pipeline.js';
import { lanzarCompAnalysis } from './tier1.js';
import { exportOutputs } from './sink.js';

const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });

function checkUser(usuario) {
  if (!config.tier1Users.includes(usuario)) throw badRequest(`Usuario no válido. Opciones: ${config.tier1Users.join(', ')}`);
}

async function getLead(id) {
  const lead = (await listLeads()).find((l) => l.id === id);
  if (!lead) throw Object.assign(new Error(`Lead no encontrado: ${id}`), { status: 404 });
  return lead;
}

export async function descartar(id) {
  await discardLead(id, 'usuario');
  await exportOutputs();
  return { ok: true, resultado: 'descartado' };
}

export async function pasarATier1(id, usuario) {
  checkUser(usuario);
  const lead = await getLead(id);
  if (lead.estado === ESTADOS.pendienteDireccion) throw badRequest('Primero agrega la dirección');
  if (lead.estado === ESTADOS.tier1) throw badRequest('El lead ya está en Tier 1');
  const updated = await updateLead(id, { estado: ESTADOS.tier1, alerta: '', tier1_usuario: usuario, tier1_en: new Date().toISOString() });
  const skill = await lanzarCompAnalysis(updated, usuario);
  await exportOutputs();
  return { ok: true, resultado: 'tier1', skill };
}

/**
 * El usuario ingresa la dirección que le dio el wholesaler.
 * En condado objetivo -> Tier 1 | otro condado -> descartado | sin determinar -> no cambia y pide ciudad/ZIP.
 */
export async function agregarDireccion(id, direccion, usuario, deps = {}) {
  checkUser(usuario);
  await getLead(id);
  const { listing, geo, key, enZona } = await resolveManualAddress(direccion, deps);
  if (enZona === null) {
    throw badRequest('No se pudo confirmar el condado. Revisa la calle y agrega ciudad y ZIP.');
  }
  await updateLead(id, {
    estado: ESTADOS.nuevo,
    alerta: '',
    direccion: listing.street_address,
    ciudad: listing.city || geo.city || null,
    zip: listing.zip || geo.zip || null,
    condado: geo.county,
    metodo_condado: geo.method,
    direccion_verificada: geo.matchedAddress,
    estado_direccion: listing.city || listing.zip ? 'COMPLETA' : 'PARCIAL',
    clave_direccion: key,
    direccion_manual: true,
  });
  if (!enZona) {
    await discardLead(id, `fuera de condado (${geo.county})`);
    await exportOutputs();
    return { ok: true, resultado: 'descartado', condado: geo.county };
  }
  const out = await pasarATier1(id, usuario);
  return { ...out, condado: geo.county };
}
