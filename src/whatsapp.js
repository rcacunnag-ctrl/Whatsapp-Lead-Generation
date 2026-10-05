import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import makeWASocket, {
  useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers,
  downloadMediaMessage, normalizeMessageContent,
} from '@whiskeysockets/baileys';
import { config } from './config.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

/**
 * Conecta la cuenta de WhatsApp como dispositivo vinculado (igual que WhatsApp Web).
 * Primera vez: imprime un código de emparejamiento (o QR) para vincular desde el teléfono.
 * La sesión queda guardada en WA_AUTH_DIR y se reutiliza.
 */
export async function connect({ onMessages, onReady } = {}) {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();
  let pairingRequested = false;

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS('Chrome'),
    markOnlineOnConnect: false, // no aparecer "en línea"; el monitor solo lee
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && !sock.authState.creds.registered) {
      if (config.waPhoneNumber && !pairingRequested) {
        pairingRequested = true;
        const code = await sock.requestPairingCode(config.waPhoneNumber);
        console.log(`\nCódigo de vinculación para +${config.waPhoneNumber}: ${code}`);
        console.log('En el teléfono: WhatsApp > Dispositivos vinculados > Vincular dispositivo > Vincular con número de teléfono.\n');
      } else if (!config.waPhoneNumber) {
        console.log('\nEscanea este QR desde WhatsApp > Dispositivos vinculados:');
        qrcode.generate(qr, { small: true });
      }
    }
    if (connection === 'open') {
      console.log(`Conectado a WhatsApp como ${sock.user?.id}`);
      onReady?.(sock);
    }
    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode;
      if (status === DisconnectReason.loggedOut) {
        console.error('La sesión fue cerrada desde el teléfono. Borra la carpeta de auth y vuelve a vincular.');
        process.exit(1);
      }
      console.warn(`Conexión cerrada (código ${status}). Reconectando en 5 s...`);
      setTimeout(() => connect({ onMessages, onReady }), 5000);
    }
  });

  if (onMessages) {
    sock.ev.on('messages.upsert', ({ messages }) => onMessages(sock, messages));
  }
  return sock;
}

/** Resuelve WA_GROUPS (JIDs o fragmentos de nombre) a un mapa jid -> nombre. */
export async function resolveGroups(sock) {
  const all = await sock.groupFetchAllParticipating();
  const groups = Object.values(all).map((g) => ({ jid: g.id, name: g.subject }));
  if (!config.waGroups.length) return { all: groups, selected: new Map() };
  const selected = new Map();
  for (const g of groups) {
    const hit = config.waGroups.some((w) => w === g.jid || g.name.toLowerCase().includes(w.toLowerCase()));
    if (hit) selected.set(g.jid, g.name);
  }
  return { all: groups, selected };
}

/** Extrae texto e imágenes de un mensaje. Devuelve null si no tiene contenido útil. */
export async function readMessage(sock, msg) {
  const content = normalizeMessageContent(msg.message);
  if (!content) return null;
  const text = content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage?.caption
    || content.videoMessage?.caption
    || content.documentMessage?.caption
    || '';

  const images = [];
  if (content.imageMessage) {
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
      await fs.mkdir(config.dirs.media, { recursive: true });
      const file = path.join(config.dirs.media, `${msg.key.id}.jpg`);
      await fs.writeFile(file, buffer);
      images.push({ path: file });
    } catch (err) {
      logger.warn({ err }, 'No se pudo descargar la imagen');
    }
  }
  if (!text && !images.length) return null;
  return { text, images };
}
