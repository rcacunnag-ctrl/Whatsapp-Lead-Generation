// Salida 100 % local: propiedades.jsonl (fuente), propiedades.csv (se abre en Excel) y propiedades.xlsx.
import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { config } from './config.js';

export const COLUMNS = [
  'fecha_mensaje', 'grupo', 'autor', 'condado', 'en_zona', 'estado_direccion', 'direccion',
  'ciudad', 'zip', 'direccion_verificada', 'metodo_condado', 'precio_usd', 'arv_usd', 'beds',
  'baths', 'sqft', 'lote_sqft', 'anio', 'tipo', 'tipo_negocio', 'condicion', 'contacto',
  'telefono', 'email', 'links_fotos', 'links_portales', 'resumen', 'duplicado',
  'mensaje_original', 'texto_ocr', 'imagenes_locales', 'id_mensaje', 'procesado_en',
];

const toCell = (v) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join('\n') : v);
const csvLine = (vals) => vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');

export async function readAllRows() {
  try {
    const raw = await fs.readFile(config.jsonlFile, 'utf8');
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export async function writeRows(rows) {
  if (!rows.length) return;
  await fs.mkdir(path.dirname(config.jsonlFile), { recursive: true });
  await fs.appendFile(config.jsonlFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const exists = await fs.access(config.csvFile).then(() => true, () => false);
  const lines = rows.map((r) => csvLine(COLUMNS.map((c) => toCell(r[c]))));
  // BOM para que Excel muestre bien acentos y ñ
  await fs.appendFile(config.csvFile, (exists ? '' : '﻿' + csvLine(COLUMNS) + '\n') + lines.join('\n') + '\n');
}

/** Regenera propiedades.xlsx con todas las filas (filtros, encabezado fijo, zona resaltada). */
export async function exportXlsx(file = config.xlsxFile) {
  const rows = await readAllRows();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Propiedades', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c, key: c, width: WIDTHS[c] || 14 }));
  for (const r of rows.slice().reverse()) {
    const row = ws.addRow(Object.fromEntries(COLUMNS.map((c) => [c, toCell(r[c])])));
    const fill = ZONE_FILL[r.en_zona];
    if (fill) row.getCell('en_zona').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  }
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  for (const c of ['precio_usd', 'arv_usd']) ws.getColumn(c).numFmt = '$#,##0';
  try {
    await wb.xlsx.writeFile(file);
    return file;
  } catch (err) {
    // En Windows falla si el archivo está abierto en Excel; el CSV sigue actualizado.
    console.warn(`No se pudo actualizar ${file} (¿está abierto en Excel?): ${err.message}`);
    return null;
  }
}

const ZONE_FILL = { SI: 'FFC6EFCE', REVISAR: 'FFFFEB9C', NO: 'FFF2F2F2' };
const WIDTHS = { fecha_mensaje: 20, grupo: 22, direccion: 30, ciudad: 18, resumen: 40, mensaje_original: 60, texto_ocr: 40, links_fotos: 30, links_portales: 30, duplicado: 24, condicion: 22 };
