import 'dotenv/config';
import path from 'node:path';

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');

export const config = {
  // WhatsApp
  waPhoneNumber: (process.env.WA_PHONE_NUMBER || '').replace(/\D/g, ''),
  waGroups: list(process.env.WA_GROUPS), // JIDs (xxxx@g.us) o parte del nombre del grupo
  authDir: path.resolve(process.env.WA_AUTH_DIR || './auth'),
  // Segundos que se agrupan mensajes consecutivos del mismo autor como una sola publicación
  postWindowSec: Number(process.env.POST_WINDOW_SEC || 90),
  // realtime: procesa al llegar | batch: solo encola (procesar con `npm run process`)
  processMode: process.env.PROCESS_MODE || 'realtime',

  // Claude
  claudeModel: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
  claudeEffort: process.env.CLAUDE_EFFORT || 'low',

  // Destino
  sheetId: process.env.GOOGLE_SHEET_ID || '',
  sheetTab: process.env.GOOGLE_SHEET_TAB || 'Propiedades',

  targetCounties: list(process.env.TARGET_COUNTIES || 'Palm Beach,Broward,Martin'),

  dirs: {
    inbox: path.join(DATA_DIR, 'inbox'),
    processed: path.join(DATA_DIR, 'processed'),
    failed: path.join(DATA_DIR, 'failed'),
    media: path.join(DATA_DIR, 'media'),
  },
  stateFile: path.join(DATA_DIR, 'state.json'),
  csvFile: path.join(DATA_DIR, 'propiedades.csv'),
};
