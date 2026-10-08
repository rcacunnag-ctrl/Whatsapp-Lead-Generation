// Acciones del usuario sobre un lead (desde el panel): descartar, pasar a Tier 1, agregar dirección y agregar precio.
import { config } from './config.js';
import { ESTADOS, listLeads, updateLead, discardLead } from './leads.js';
import { resolveManualAddress, computeAlerta } from './pipeline.js';
import { lanzarCompAnalysis, setJobState } from './tier1.js';
import { parseMoney } from './extract.js';
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
  if (!lead.precio_usd) throw badRequest('Falta el precio: agrégalo antes de pasar a Tier 1');
  const updated = await updateLead(id, { estado: ESTADOS.tier1, alerta: computeAlerta({ ...lead, estado: ESTADOS.tier1 }), tier1_usuario: usuario, tier1_en: new Date().toISOString() });
  const skill = await lanzarCompAnalysis(updated, usuario);
  if (skill.lanzado) await updateLead(id, { informe_estado: skill.estado, informe_en: new Date().toISOString() });
  await exportOutputs();
  return { ok: true, resultado: 'tier1', skill };
}

const money = (v) => {
  const m = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|mm)?$/i.exec(String(v).trim());
  const n = m ? parseMoney(m[1], m[2]) : NaN;
  if (!(n >= 1000)) throw badRequest(`Monto no válido: "${v}" (ej. 325000, 325,000 o $325k)`);
  return n;
};

/**
 * Agrega el precio que dio el wholesaler (y el ARV, opcional) a un lead que no lo tenía.
 * Un ARV vacío deja el que ya hubiera. Registra quién lo hizo.
 */
export async function agregarPrecio(id, body, usuario) {
  checkUser(usuario);
  const lead = await getLead(id);
  if (lead.precio_usd) throw badRequest('Este lead ya tiene precio');
  if (!String(body.precio_usd ?? '').trim()) throw badRequest('Falta el precio');
  const patch = { precio_usd: money(body.precio_usd) };
  if (String(body.arv_usd ?? '').trim()) patch.arv_usd = money(body.arv_usd);
  const cambios = [...(lead.cambios || []), { en: new Date().toISOString(), usuario, campos: Object.keys(patch) }].slice(-20);
  await updateLead(id, { ...patch, cambios, alerta: computeAlerta({ ...lead, ...patch }) });
  await exportOutputs();
  return { ok: true, resultado: 'precio' };
}

/** Recalcula las alertas de todos los leads (al arrancar, por si cambian las reglas). */
export async function refreshAlertas() {
  let n = 0;
  for (const lead of await listLeads()) {
    const alerta = computeAlerta(lead);
    if (alerta !== (lead.alerta || '')) {
      await updateLead(lead.id, { alerta });
      n++;
    }
  }
  if (n) await exportOutputs();
  return n;
}

/** El PC que ejecuta el skill reporta el avance de la orden; se refleja en el lead (si sigue activo). */
export async function reportarInforme(id, body) {
  const job = await setJobState(id, body);
  if ((await listLeads()).some((l) => l.id === id)) {
    await updateLead(id, { informe_estado: job.estado, informe_ruta: job.ruta || '', informe_detalle: job.detalle || '', informe_en: job.actualizado_en });
    await exportOutputs();
  }
  return { ok: true, orden: job };
}

/**
 * El usuario ingresa la dirección que le dio el wholesaler.
 * En condado objetivo -> Tier 1 (o Nuevo si falta el precio) | otro condado -> descartado |
 * sin determinar -> no cambia y pide ciudad/ZIP.
 */
export async function agregarDireccion(id, direccion, usuario, deps = {}) {
  checkUser(usuario);
  await getLead(id);
  const { listing, geo, key, enZona } = await resolveManualAddress(direccion, deps);
  if (enZona === null) {
    throw badRequest('No se pudo confirmar el condado. Revisa la calle y agrega ciudad y ZIP.');
  }
  const lead = await getLead(id);
  await updateLead(id, {
    estado: ESTADOS.nuevo,
    alerta: computeAlerta({ ...lead, estado: ESTADOS.nuevo }),
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
  if (!lead.precio_usd) {
    // En zona pero sin precio: queda como Nuevo con la alerta de precio hasta que se agregue
    await exportOutputs();
    return { ok: true, resultado: 'falta_precio', condado: geo.county };
  }
  const out = await pasarATier1(id, usuario);
  return { ...out, condado: geo.county };
}
