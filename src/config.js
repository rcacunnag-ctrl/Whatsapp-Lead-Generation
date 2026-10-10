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
  // Vista de solo lectura para terceros (vacío = desactivada). Se sirve en /v/<token>/
  vistaToken: (process.env.VISTA_TOKEN || '').trim(),
  vistaPort: Number(process.env.VISTA_PORT || 3001),

  targetCounties: list(process.env.TARGET_COUNTIES || 'Palm Beach,Broward,Martin'),

  // Tier 1: usuarios que pueden ejecutar el comp-analysis-report y si el lanzamiento está activo
  tier1Users: list(process.env.TIER1_USERS || 'Andres,Carlos,Jaime'),
  tier1SkillEnabled: bool(process.env.TIER1_SKILL_ENABLED, false),
  // Criterios de Tier 1 automático: margen (ARV - precio) / ARV >= CRIT_MARGEN_MIN % y precio < CRIT_PRECIO_MAX
  critMargenMin: Number(process.env.CRIT_MARGEN_MIN || 60),
  critPrecioMax: Number(process.env.CRIT_PRECIO_MAX || 300000),
  // Informes Tier 1 automáticos que pueden empezar por día (los demás esperan al día siguiente)
  tier1AutoMaxDia: Number(process.env.TIER1_AUTO_MAX_DIA || 3),
  timeZone: process.env.TZ_NEGOCIO || 'America/New_York',

  // Avisos por WhatsApp (mismo número) al grupo NOTIF_GRUPO: un resumen cada NOTIF_INTERVALO_MIN, en NOTIF_HORAS
  notifEnabled: bool(process.env.NOTIF_ENABLED, false),
  notifGrupo: (process.env.NOTIF_GRUPO || 'Grupo prueba Wholesaler').trim(),
  notifIntervaloMin: Number(process.env.NOTIF_INTERVALO_MIN || 120),
  notifHoras: process.env.NOTIF_HORAS || '8-21',

  dirs: {
    inbox: path.join(DATA_DIR, 'inbox'),
    processed: path.join(DATA_DIR, 'processed'),
    failed: path.join(DATA_DIR, 'failed'),
    media: path.join(DATA_DIR, 'media'),
    tier1Jobs: path.join(DATA_DIR, 'tier1-jobs'),
    informes: path.join(DATA_DIR, 'informes'),
    vista: path.join(DATA_DIR, 'vista'),
  },
  leadsFile: path.join(DATA_DIR, 'leads.json'),
  notifFile: path.join(DATA_DIR, 'notificaciones.json'),
  stateFile: path.join(DATA_DIR, 'state.json'),
  jsonlFile: path.join(DATA_DIR, 'propiedades.jsonl'),
  csvFile: path.join(DATA_DIR, 'propiedades.csv'),
  xlsxFile: path.join(DATA_DIR, 'propiedades.xlsx'),
};
