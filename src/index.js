import { config } from './config.js';
import { connect, resolveGroups, readMessage } from './whatsapp.js';
import { enqueuePost, ensureDirs, loadState } from './store.js';
import { processInbox } from './process-inbox.js';

const listOnly = process.argv.includes('--list-groups');
let selected = new Map();
const pending = new Map(); // `${grupo}|${autor}` -> publicación en construcción
let markReady;
const groupsReady = new Promise((r) => { markReady = r; }); // los mensajes offline llegan antes de resolver grupos

await ensureDirs();

async function flush(key, { process: run = true } = {}) {
  const post = pending.get(key);
  pending.delete(key);
  if (!post) return;
  clearTimeout(post.timer);
  delete post.timer;
  await enqueuePost(post);
  console.log(`[${post.groupName}] publicación encolada (${post.images.length} imágenes)`);
  if (run && config.processMode === 'realtime') {
    const s = await processInbox();
    if (s) console.log(`  -> propiedades: ${s.rows}, en zona: ${s.inZone}, fallidas: ${s.failed}`);
  }
}

async function onMessages(sock, messages) {
  await groupsReady;
  const state = await loadState();
  for (const msg of messages) {
    const jid = msg.key.remoteJid;
    if (!jid?.endsWith('@g.us') || !selected.has(jid) || msg.key.fromMe) continue;
    if (state.seenMessageIds[msg.key.id]) continue;

    const data = await readMessage(sock, msg);
    if (!data) continue;

    // Agrupa texto + fotos consecutivas del mismo autor en una sola publicación.
    const sender = msg.pushName || msg.key.participant || 'desconocido';
    const key = `${jid}|${msg.key.participant || sender}`;
    const ts = new Date(Number(msg.messageTimestamp) * 1000).toISOString();
    const post = pending.get(key) || {
      id: msg.key.id, timestamp: ts, groupJid: jid, groupName: selected.get(jid),
      sender, text: '', images: [], messageIds: [],
    };
    post.text = [post.text, data.text].filter(Boolean).join('\n');
    post.images.push(...data.images);
    post.messageIds.push(msg.key.id);
    clearTimeout(post.timer);
    post.timer = setTimeout(() => flush(key).catch((e) => console.error(e)), config.postWindowSec * 1000);
    pending.set(key, post);
  }
}

await connect({
  onMessages: listOnly ? undefined : onMessages,
  onReady: async (sock) => {
    const { all, selected: sel } = await resolveGroups(sock);
    if (listOnly || !config.waGroups.length) {
      console.log('\nGrupos de esta cuenta (copia el JID o parte del nombre en WA_GROUPS):');
      for (const g of all) console.log(`  ${g.jid}  ${g.name}`);
      if (listOnly) process.exit(0);
      console.log('\nWA_GROUPS está vacío: no se monitorea ningún grupo todavía.');
    }
    selected = sel;
    markReady();
    console.log(`Monitoreando ${selected.size} grupo(s): ${[...selected.values()].join(' | ')}`);
    if (config.processMode === 'realtime') await processInbox();
  },
});

// Al apagar, encola lo que esté pendiente para no perderlo.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    for (const key of [...pending.keys()]) await flush(key, { process: false }); // se procesa al reiniciar o con `npm run process`
    process.exit(0);
  });
}
