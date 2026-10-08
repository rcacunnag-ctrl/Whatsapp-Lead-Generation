// Órdenes de comp-analysis-report cuando un lead pasa a Tier 1.
// Con TIER1_SKILL_ENABLED=true se deja una orden en data/tier1-jobs/<id>.json (estado "pendiente").
// Un PC con Claude (tarea programada) las consulta por la API del panel, ejecuta el skill y
// reporta el avance: pendiente -> en_proceso -> listo | error. Cada cambio se refleja en el lead.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export const SKILL_TIER1 = 'comp-analysis-report';
export const ESTADOS_ORDEN = ['pendiente', 'en_proceso', 'listo', 'error'];

const jobFile = (id) => path.join(config.dirs.tier1Jobs, `${path.basename(id)}.json`);

/** Datos del lead que viajan en la orden. Formato de carpeta de los skills: "<número calle>, <Ciudad>, FL <zip>" */
const jobLead = (lead) => ({
  id: lead.id,
  direccion: [lead.direccion, lead.ciudad, `FL ${lead.zip || ''}`.trim()].filter(Boolean).join(', '),
  condado: lead.condado,
  precio_usd: lead.precio_usd,
  arv_usd: lead.arv_usd,
  beds: lead.beds,
  baths: lead.baths,
  sqft: lead.sqft,
  tipo: lead.tipo,
  contacto: lead.contacto,
  telefono: lead.telefono,
  mensaje_original: lead.mensaje_original,
});

export async function lanzarCompAnalysis(lead, usuario, { enabled = config.tier1SkillEnabled } = {}) {
  if (!enabled) return { lanzado: false, motivo: 'por habilitar (TIER1_SKILL_ENABLED=false)' };
  await fs.mkdir(config.dirs.tier1Jobs, { recursive: true });
  const now = new Date().toISOString();
  const job = {
    id: lead.id,
    skill: SKILL_TIER1,
    usuario,
    estado: 'pendiente',
    creado_en: now,
    actualizado_en: now,
    lead: jobLead(lead),
  };
  await fs.writeFile(jobFile(lead.id), JSON.stringify(job, null, 2));
  return { lanzado: true, estado: 'pendiente' };
}

export async function listJobs({ estado } = {}) {
  const files = await fs.readdir(config.dirs.tier1Jobs).catch(() => []);
  const jobs = [];
  for (const f of files.filter((n) => n.endsWith('.json')).sort()) {
    const job = JSON.parse(await fs.readFile(path.join(config.dirs.tier1Jobs, f), 'utf8'));
    if (!estado || job.estado === estado) jobs.push(job);
  }
  return jobs;
}

/** Actualiza el estado de una orden. Devuelve la orden actualizada. */
export async function setJobState(id, { estado, ruta, detalle }) {
  if (!ESTADOS_ORDEN.includes(estado)) {
    throw Object.assign(new Error(`Estado no válido. Opciones: ${ESTADOS_ORDEN.join(', ')}`), { status: 400 });
  }
  const file = jobFile(id);
  const job = JSON.parse(await fs.readFile(file, 'utf8').catch(() => {
    throw Object.assign(new Error(`Orden no encontrada: ${id}`), { status: 404 });
  }));
  Object.assign(job, { estado, actualizado_en: new Date().toISOString() });
  if (ruta !== undefined) job.ruta = String(ruta).slice(0, 500);
  if (detalle !== undefined) job.detalle = String(detalle).slice(0, 2000);
  await fs.writeFile(`${file}.tmp`, JSON.stringify(job, null, 2));
  await fs.rename(`${file}.tmp`, file);
  return job;
}
