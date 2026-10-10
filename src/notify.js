// Avisos al grupo de WhatsApp NOTIF_GRUPO con el mismo número del monitor. Para no parecer un bot:
// un solo mensaje de resumen cada NOTIF_INTERVALO_MIN minutos (120), solo si hay novedades y solo
// en horario NOTIF_HORAS (hora de Florida). La cola se guarda en data/notificaciones.json y se
// resuelve contra los leads al enviar (un lead descartado o con la alerta ya resuelta no sale).
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { listLeads } from './leads.js';

const SECCIONES = [
  ['alerta', '⚠️ Pedir datos al wholesaler'],
  ['informe_t1', '✅ Informes Tier 1 listos'],
  ['informe_t1_error', '❌ Informes Tier 1 con error'],
  ['informe_t2', '📄 Informes Tier 2 listos'],
];
const MAX_POR_SECCION = 10;

let cola;
let lock = Promise.resolve();
let enviarFn = null;

function serial(fn) {
  const run = lock.then(fn);
  lock = run.catch(() => {});
  return run;
}

async function cargar() {
  if (cola) return cola;
  try {
    cola = JSON.parse(await fs.readFile(config.notifFile, 'utf8'));
  } catch {
    cola = {};
  }
  cola.pendientes ||= [];
  cola.ultimo_envio ||= null;
  return cola;
}

async function guardar() {
  await fs.mkdir(path.dirname(config.notifFile), { recursive: true });
  await fs.writeFile(`${config.notifFile}.tmp`, JSON.stringify(cola, null, 2));
  await fs.rename(`${config.notifFile}.tmp`, config.notifFile);
}

/** Registra la conexión de WhatsApp vigente (cambia en cada reconexión). */
export function conectarNotificaciones(sock, jid) {
  enviarFn = jid ? (text) => sock.sendMessage(jid, { text }) : null;
}

/** Agrega una novedad a la cola. tipo: alerta | informe_t1 | informe_t1_error | informe_t2 */
export function encolar(tipo, id, detalle = '') {
  if (!config.notifEnabled) return Promise.resolve();
  return serial(async () => {
    const c = await cargar();
    const clave = `${tipo}|${id}|${tipo === 'informe_t2' ? detalle : ''}`;
    c.pendientes = c.pendientes.filter((e) => e.clave !== clave);
    c.pendientes.push({ clave, tipo, id, detalle: String(detalle).slice(0, 200), en: new Date().toISOString() });
    await guardar();
  });
}

const corto = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : `$${Math.round(n / 1000)}k`);
const direccion = (l) => [l.direccion, l.ciudad].filter(Boolean).join(', ') || `Sin dirección${l.ciudad || l.zip ? ` (${l.ciudad || l.zip})` : ''}`;

function linea(tipo, l, detalle) {
  const precio = [l.precio_usd && corto(l.precio_usd), l.arv_usd && `ARV ${corto(l.arv_usd)}`].filter(Boolean).join(' / ');
  if (tipo === 'alerta') {
    const quien = [l.contacto || l.autor, l.telefono].filter(Boolean).join(' ');
    return `• ${direccion(l)}${precio ? ` (${precio})` : ''} — ${l.alerta.replace(/^Solicitar /, '').replace(/ al wholesaler$/, '')}${quien ? ` · ${quien}` : ''}`;
  }
  return `• ${direccion(l)}${detalle ? ` — ${detalle}` : ''}`;
}

/** Texto del resumen. Devuelve '' si ninguna novedad sigue vigente. */
export function armarResumen(eventos, leads, ahora = new Date()) {
  const porId = new Map(leads.map((l) => [l.id, l]));
  const partes = [];
  for (const [tipo, titulo] of SECCIONES) {
    const lineas = eventos
      .filter((e) => e.tipo === tipo && porId.has(e.id) && (tipo !== 'alerta' || porId.get(e.id).alerta))
      .map((e) => linea(tipo, porId.get(e.id), e.detalle));
    if (!lineas.length) continue;
    const extra = lineas.length > MAX_POR_SECCION ? [`…y ${lineas.length - MAX_POR_SECCION} más en el panel`] : [];
    partes.push([`*${titulo} (${lineas.length})*`, ...lineas.slice(0, MAX_POR_SECCION), ...extra].join('\n'));
  }
  if (!partes.length) return '';
  const hora = ahora.toLocaleString('es-US', { timeZone: config.timeZone, dateStyle: 'short', timeStyle: 'short' });
  return [`*Monitor de Propiedades* · resumen ${hora}`, ...partes].join('\n\n');
}

function enHorario(ahora) {
  const [desde, hasta] = config.notifHoras.split('-').map(Number);
  const h = Number(ahora.toLocaleString('en-US', { timeZone: config.timeZone, hour: 'numeric', hourCycle: 'h23' }));
  return h >= desde && h < hasta;
}

/** Envía el resumen si toca (intervalo, horario y novedades). Si el envío falla, la cola se conserva. */
export function revisarEnvio({ ahora = new Date(), enviar = enviarFn } = {}) {
  return serial(async () => {
    if (!config.notifEnabled) return { enviado: false, motivo: 'desactivado' };
    const c = await cargar();
    if (!c.pendientes.length) return { enviado: false, motivo: 'sin novedades' };
    if (!enviar) return { enviado: false, motivo: 'sin conexión' };
    if (c.ultimo_envio && ahora - new Date(c.ultimo_envio) < config.notifIntervaloMin * 60000) return { enviado: false, motivo: 'intervalo' };
    if (!enHorario(ahora)) return { enviado: false, motivo: 'fuera de horario' };
    const texto = armarResumen(c.pendientes, await listLeads(), ahora);
    if (texto) await enviar(texto);
    const n = c.pendientes.length;
    c.pendientes = [];
    if (texto) c.ultimo_envio = ahora.toISOString();
    await guardar();
    return { enviado: Boolean(texto), eventos: n };
  });
}

/** Revisa cada 5 minutos si toca enviar. */
export function iniciarNotificaciones(log = console) {
  if (!config.notifEnabled) return null;
  return setInterval(() => {
    revisarEnvio().then((r) => r.enviado && log.log(`Resumen enviado al grupo (${r.eventos} novedades)`)).catch((e) => log.error(`Avisos: ${e.message}`));
  }, 5 * 60000);
}

/** Solo para pruebas. */
export function _resetNotify() {
  cola = undefined;
  enviarFn = null;
}
