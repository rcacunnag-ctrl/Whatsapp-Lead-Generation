import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { listInbox, moveTo, loadState, saveState } from './store.js';
import { processPost } from './pipeline.js';
import { exportOutputs } from './sink.js';
import { addLeads } from './leads.js';
import { evaluarIngresados } from './actions.js';
import { closeOcr } from './ocr.js';

let running = null;
let rerun = false;

async function processFile(file, summary) {
  const post = JSON.parse(await fs.readFile(file, 'utf8'));
  const { rows, descartes } = await processPost(post);
  const added = await addLeads(rows);
  await evaluarIngresados(added); // criterios: Tier 1 automático o No califica
  // Se marca como visto solo después de escribir, para poder reintentar si falla la escritura.
  const state = await loadState();
  const now = new Date().toISOString();
  for (const id of new Set([post.id, ...(post.messageIds || [])].filter(Boolean))) state.seenMessageIds[id] = now;
  await saveState();
  await moveTo(file, config.dirs.processed);
  summary.posts++;
  summary.rows += added.length;
  summary.discarded += descartes.length + (rows.length - added.length);
}

/** Procesa todas las publicaciones en data/inbox. Seguro de llamar varias veces (no se solapa). */
export function processInbox(log = console) {
  if (running) {
    rerun = true; // llegó algo nuevo mientras procesábamos: dar otra vuelta al terminar
    return running;
  }
  running = (async () => {
    const summary = { posts: 0, rows: 0, discarded: 0, failed: 0 };
    try {
      do {
        rerun = false;
        for (const file of await listInbox()) {
          try {
            await processFile(file, summary);
          } catch (err) {
            summary.failed++;
            log.error?.(`Error procesando ${file}: ${err.message}`);
            await moveTo(file, config.dirs.failed).catch(() => {});
          }
        }
      } while (rerun);
      if (summary.rows) await exportOutputs();
    } finally {
      running = null;
    }
    return summary;
  })();
  return running;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = await processInbox();
  await closeOcr();
  console.log(`Publicaciones: ${s.posts} | Leads nuevos: ${s.rows} | Descartadas: ${s.discarded} | Fallidas: ${s.failed}`);
}
