// OCR local de flyers con Tesseract (WASM). Sin servicios externos: el modelo de idioma viene en node_modules.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import { DATA_DIR } from './config.js';

const require = createRequire(import.meta.url);
let workerPromise;

async function getWorker() {
  workerPromise ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    const eng = require('@tesseract.js-data/eng');
    const cachePath = path.join(DATA_DIR, '.ocr-cache');
    await fs.mkdir(cachePath, { recursive: true });
    return createWorker('eng', 1, { langPath: eng.langPath, gzip: eng.gzip, cachePath });
  })();
  return workerPromise;
}

/** Devuelve el texto reconocido en las imágenes (vacío si falla). */
export async function ocrImages(paths) {
  const texts = [];
  for (const p of paths.slice(0, 5)) {
    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(p);
      if (data?.text?.trim()) texts.push(data.text.trim());
    } catch (err) {
      console.warn(`OCR falló en ${p}: ${err.message}`);
    }
  }
  return texts.join('\n');
}

export async function closeOcr() {
  if (workerPromise) await (await workerPromise).terminate();
  workerPromise = undefined;
}
