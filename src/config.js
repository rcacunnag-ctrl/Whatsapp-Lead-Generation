import 'dotenv/config';
import path from 'node:path';

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const bool = (v, def) => (v === undefined || v === '' ? def : /^(1|true|yes|si)$/i.test(v));

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');

export const config = {
  // WhatsApp (única dependencia externa)
  waPhoneNumber: (process.env.WA_PHONE_NUMBER || '').replace(/\D/g, ''),
  waGroups: list(process.env.WA_GROUPS), // JIDs (xxxx@g.us) o parte del nombre del grupo
  authDir: path.resolve(process.env.WA_AUTH_DIR || './auth'),
  // Segundos que se agrupan mensajes consecutivos del mismo autor como una sola publicación
  postWindowSec: Number(process.env.POST_WINDOW_SEC || 90),
  // realtime: procesa al llegar | batch: solo encola (procesar con `npm run process`)
  processMode: process.env.PROCESS_MODE || 'realtime',

  // Extracción local
  ocrEnabled: bool(process.env.OCR_ENABLED, true), // leer texto de flyers con Tesseract (offline)
  useCensusGeocoder: bool(process.env.USE_CENSUS_GEOCODER, false), // opcional, gratuito, requiere internet

  // Panel local
  dashboardPort: Number(process.env.DASHBOARD_PORT || 3000),
  dashboardHost: process.env.DASHBOARD_HOST || '127.0.0.1',

  targetCounties: list(process.env.TARGET_COUNTIES || 'Palm Beach,Broward,Martin'),

  dirs: {
    inbox: path.join(DATA_DIR, 'inbox'),
    processed: path.join(DATA_DIR, 'processed'),
    failed: path.join(DATA_DIR, 'failed'),
    media: path.join(DATA_DIR, 'media'),
  },
  stateFile: path.join(DATA_DIR, 'state.json'),
  jsonlFile: path.join(DATA_DIR, 'propiedades.jsonl'),
  csvFile: path.join(DATA_DIR, 'propiedades.csv'),
  xlsxFile: path.join(DATA_DIR, 'propiedades.xlsx'),
};
