import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { config } from './config.js';

export const COLUMNS = [
  'fecha_mensaje', 'grupo', 'autor', 'condado', 'en_zona', 'estado_direccion', 'direccion',
  'ciudad', 'zip', 'direccion_verificada', 'metodo_condado', 'precio_usd', 'arv_usd', 'beds',
  'baths', 'sqft', 'lote_sqft', 'anio', 'tipo', 'tipo_negocio', 'condicion', 'contacto',
  'telefono', 'email', 'links_fotos', 'links_portales', 'resumen', 'duplicado',
  'mensaje_original', 'imagenes_locales', 'id_mensaje', 'procesado_en',
];

let sheetsApi;
let sheetReady = false;

async function sheets() {
  if (sheetsApi) return sheetsApi;
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  sheetsApi = google.sheets({ version: 'v4', auth });
  return sheetsApi;
}

async function ensureSheet() {
  if (sheetReady) return;
  const api = await sheets();
  const meta = await api.spreadsheets.get({ spreadsheetId: config.sheetId });
  const exists = meta.data.sheets.some((s) => s.properties.title === config.sheetTab);
  if (!exists) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: config.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: config.sheetTab, gridProperties: { frozenRowCount: 1 } } } }] },
    });
  }
  const head = await api.spreadsheets.values.get({ spreadsheetId: config.sheetId, range: `${config.sheetTab}!A1:A1` });
  if (!head.data.values?.length) {
    await api.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: `${config.sheetTab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
  }
  sheetReady = true;
}

const toCell = (v) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(' \n') : v);

/** Escribe filas en Google Sheets si hay GOOGLE_SHEET_ID; si no, en data/propiedades.csv. */
export async function writeRows(rows) {
  if (!rows.length) return;
  const values = rows.map((r) => COLUMNS.map((c) => toCell(r[c])));
  if (config.sheetId) {
    await ensureSheet();
    await (await sheets()).spreadsheets.values.append({
      spreadsheetId: config.sheetId,
      range: `${config.sheetTab}!A1`,
      valueInputOption: 'RAW', // RAW evita que textos como "+1 561..." se interpreten como fórmulas
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
    return;
  }
  await fs.mkdir(path.dirname(config.csvFile), { recursive: true });
  const exists = await fs.access(config.csvFile).then(() => true, () => false);
  const csv = (vals) => vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  const lines = (exists ? [] : [csv(COLUMNS)]).concat(values.map(csv));
  await fs.appendFile(config.csvFile, lines.join('\n') + '\n');
}
