import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

export async function ensureDirs() {
  for (const d of Object.values(config.dirs)) await fs.mkdir(d, { recursive: true });
}

/** Encola una publicación cruda (texto + imágenes) para procesarla luego. */
export async function enqueuePost(post) {
  await ensureDirs();
  const id = post.id || crypto.randomUUID();
  const file = path.join(config.dirs.inbox, `${Date.now()}-${safe(id)}.json`);
  await fs.writeFile(file, JSON.stringify({ ...post, id }, null, 2));
  return file;
}

export async function listInbox() {
  await ensureDirs();
  const files = (await fs.readdir(config.dirs.inbox)).filter((f) => f.endsWith('.json')).sort();
  return files.map((f) => path.join(config.dirs.inbox, f));
}

export async function moveTo(file, dir) {
  await fs.rename(file, path.join(dir, path.basename(file)));
}

// --- Estado (mensajes vistos y direcciones ya registradas) ---
let state;
export async function loadState() {
  if (state) return state;
  try {
    state = JSON.parse(await fs.readFile(config.stateFile, 'utf8'));
  } catch {
    state = { seenMessageIds: {}, addresses: {} };
  }
  return state;
}
export async function saveState() {
  if (!state) return;
  await fs.mkdir(path.dirname(config.stateFile), { recursive: true });
  await fs.writeFile(config.stateFile, JSON.stringify(state, null, 2));
}

export function addressKey(listing, geo) {
  const raw = geo?.matchedAddress || [listing.street_address, listing.zip || listing.city].filter(Boolean).join(' ');
  if (!listing.street_address && !geo?.matchedAddress) return null;
  return raw.toUpperCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\b(STREET)\b/g, 'ST').replace(/\b(AVENUE)\b/g, 'AVE').replace(/\b(ROAD)\b/g, 'RD')
    .replace(/\b(DRIVE)\b/g, 'DR').replace(/\b(COURT)\b/g, 'CT').replace(/\b(BOULEVARD)\b/g, 'BLVD')
    .replace(/\b(NORTHWEST)\b/g, 'NW').replace(/\b(NORTHEAST)\b/g, 'NE')
    .replace(/\b(SOUTHWEST)\b/g, 'SW').replace(/\b(SOUTHEAST)\b/g, 'SE')
    .replace(/\s+/g, ' ').trim();
}

const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
