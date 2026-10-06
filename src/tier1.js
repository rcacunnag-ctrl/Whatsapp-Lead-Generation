// Lanzamiento del skill comp-analysis-report cuando un lead pasa a Tier 1.
// POR HABILITAR: con TIER1_SKILL_ENABLED=false (por defecto) no hace nada.
// Activo, deja un trabajo en data/tier1-jobs/<id>.json. El PC personal del usuario elegido
// (Andres, Carlos o Jaime, con su propia cuenta de Claude) debe recoger ese archivo y ejecutar el skill.
// Ese receptor todavía no existe.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export const SKILL_TIER1 = 'comp-analysis-report';

export async function lanzarCompAnalysis(lead, usuario, { enabled = config.tier1SkillEnabled } = {}) {
  if (!enabled) return { lanzado: false, motivo: 'por habilitar (TIER1_SKILL_ENABLED=false)' };
  await fs.mkdir(config.dirs.tier1Jobs, { recursive: true });
  const job = {
    skill: SKILL_TIER1,
    usuario,
    creado_en: new Date().toISOString(),
    lead: {
      id: lead.id,
      direccion: [lead.direccion, lead.ciudad, 'FL', lead.zip].filter(Boolean).join(', '),
      condado: lead.condado,
      precio_usd: lead.precio_usd,
      arv_usd: lead.arv_usd,
      contacto: lead.contacto,
      telefono: lead.telefono,
    },
  };
  const file = path.join(config.dirs.tier1Jobs, `${lead.id}.json`);
  await fs.writeFile(file, JSON.stringify(job, null, 2));
  return { lanzado: true, archivo: file };
}
