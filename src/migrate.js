// Migración única: pasa las filas de propiedades.jsonl (formato anterior) por las reglas nuevas
// y las carga en data/leads.json. El archivo original queda como propiedades.jsonl.bak.
import fs from 'node:fs/promises';
import { config } from './config.js';
import { classify } from './pipeline.js';
import { addLeads } from './leads.js';
import { addressKey } from './store.js';
import { readLegacyRows, exportOutputs } from './sink.js';

export async function migrateLegacy(log = console) {
  const hasLeads = await fs.access(config.leadsFile).then(() => true, () => false);
  const legacy = await readLegacyRows();
  if (hasLeads || !legacy.length) return null;

  const rows = [];
  let discarded = 0;
  for (const { en_zona, ...r } of legacy) {
    const decision = classify(
      { street_address: r.direccion, arv_usd: r.arv_usd },
      { county: r.condado, ambiguous: en_zona === 'REVISAR' },
    );
    if (decision.descartar) discarded++;
    else {
      const clave_direccion = addressKey({ street_address: r.direccion, zip: r.zip, city: r.ciudad }, { matchedAddress: r.direccion_verificada });
      rows.push({ ...r, estado: decision.estado, alerta: decision.alerta || '', clave_direccion });
    }
  }
  const added = await addLeads(rows);
  await fs.rename(config.jsonlFile, `${config.jsonlFile}.bak`);
  await exportOutputs();
  log.log?.(`Migración: ${legacy.length} filas anteriores -> ${added.length} leads, ${discarded} descartadas`);
  return { total: legacy.length, leads: added.length, discarded };
}
