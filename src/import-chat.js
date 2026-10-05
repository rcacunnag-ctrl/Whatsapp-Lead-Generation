// Importa un chat exportado desde WhatsApp (Más > Exportar chat) y lo encola para procesar.
// Uso: npm run import -- "ruta/_chat.txt" [--group "Nombre del grupo"] [--media-dir carpeta] [--since 2026-09-01]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { enqueuePost } from './store.js';
import { processInbox } from './process-inbox.js';
import { closeOcr } from './ocr.js';

// iOS:     [10/5/26, 9:15:32 AM] Nombre: texto
// Android: 10/5/26, 9:15 AM - Nombre: texto
const LINE = /^‎?\[?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:-\s*)?([^:]+?):\s([\s\S]*)$/;
const ATTACHED = /<(?:attached|adjunto):\s*([^>]+)>/gi;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const SYSTEM_NOTICE = /^(messages and calls are end-to-end encrypted|los mensajes y las llamadas están cifrados|this message was deleted|se eliminó este mensaje)/i;

export function parseExport(raw, { dayFirst = false } = {}) {
  const messages = [];
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const m = LINE.exec(line);
    if (!m) {
      if (messages.length) messages.at(-1).text += `\n${line}`;
      continue;
    }
    const [, a, b, y, hh, mm, ss, ampm, sender, text] = m;
    const [month, day] = dayFirst ? [b, a] : [a, b];
    let hour = Number(hh);
    const pm = ampm && /p/i.test(ampm);
    if (ampm && pm && hour < 12) hour += 12;
    if (ampm && !pm && hour === 12) hour = 0;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(year, Number(month) - 1, Number(day), hour, Number(mm), Number(ss || 0));
    messages.push({ date, sender: sender.replace(/‎/g, '').trim(), text: text.replace(/‎/g, '') });
  }
  return messages;
}

/** Une mensajes consecutivos del mismo autor dentro de la ventana en una publicación. */
export function groupIntoPosts(messages, windowSec = config.postWindowSec) {
  const posts = [];
  for (const msg of messages) {
    const last = posts.at(-1);
    if (last && last.sender === msg.sender && (msg.date - last.lastDate) / 1000 <= windowSec) {
      last.parts.push(msg.text);
      last.lastDate = msg.date;
    } else {
      posts.push({ sender: msg.sender, date: msg.date, lastDate: msg.date, parts: [msg.text] });
    }
  }
  return posts;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const groupName = opt('--group');
  const mediaDir = opt('--media-dir');
  const since = opt('--since');
  const dayFirst = args.includes('--day-first') && args.splice(args.indexOf('--day-first'), 1);
  const file = args[0];
  if (!file) {
    console.error('Uso: npm run import -- "_chat.txt" [--group "Nombre"] [--media-dir carpeta] [--since AAAA-MM-DD] [--day-first]');
    process.exit(1);
  }

  const raw = await fs.readFile(file, 'utf8');
  let messages = parseExport(raw, { dayFirst: Boolean(dayFirst) });
  if (since) messages = messages.filter((m) => m.date >= new Date(since));
  const posts = groupIntoPosts(messages);
  const group = groupName || path.basename(path.dirname(path.resolve(file)));
  const baseDir = mediaDir || path.dirname(path.resolve(file));

  let queued = 0;
  for (const p of posts) {
    const text = p.parts.join('\n');
    const images = [...text.matchAll(ATTACHED)]
      .map((m) => m[1].trim())
      .filter((f) => IMAGE_EXT.test(f))
      .map((f) => ({ path: path.join(baseDir, f) }));
    const existing = [];
    for (const img of images) if (await fs.access(img.path).then(() => true, () => false)) existing.push(img);
    const clean = text.replace(ATTACHED, '').replace(/<Media omitted>|image omitted|imagen omitida/gi, '').trim();
    if (!clean && !existing.length) continue;
    if (SYSTEM_NOTICE.test(clean) && !existing.length) continue;
    const id = 'import-' + crypto.createHash('sha1').update(`${group}|${p.sender}|${p.date.toISOString()}|${clean}`).digest('hex').slice(0, 16);
    queued++;
    await enqueuePost({ id, timestamp: p.date.toISOString(), groupName: group, sender: p.sender, text: clean, images: existing });
  }
  console.log(`Mensajes leídos: ${messages.length} | Publicaciones encoladas: ${queued}`);
  const s = await processInbox();
  await closeOcr();
  console.log(`Propiedades: ${s.rows} | En zona: ${s.inZone} | Fallidas: ${s.failed}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
