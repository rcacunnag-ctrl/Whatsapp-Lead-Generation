// Vista de solo lectura para terceros: copia del panel sin acciones en data/vista/, servida en otro puerto
// solo bajo /v/<VISTA_TOKEN>/. Se publica a internet con Tailscale Funnel; el panel con acciones sigue
// accesible solo por Tailscale. Sin VISTA_TOKEN no se genera ni se sirve nada.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { listLeads } from './leads.js';
import { PAGE } from './page.js';

const FILES = {
  '': ['index.html', 'text/html; charset=utf-8'],
  'index.html': ['index.html', 'text/html; charset=utf-8'],
  'datos.json': ['datos.json', 'application/json'],
  'propiedades.csv': ['propiedades.csv', 'text/csv; charset=utf-8'],
  'propiedades.xlsx': ['propiedades.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

/** Regenera la copia de solo lectura. Se llama después de cada cambio en los leads. */
export async function writeVista({ token = config.vistaToken } = {}) {
  if (!token) return null;
  const dir = config.dirs.vista;
  await fs.mkdir(path.join(dir, 'media'), { recursive: true });
  const leads = await listLeads();
  const html = PAGE.replace('<head>', '<head><meta name="robots" content="noindex"><script>window.RO=true</script>');
  await write(path.join(dir, 'index.html'), html);
  await write(path.join(dir, 'datos.json'), JSON.stringify({ generado_en: new Date().toISOString(), leads }));
  for (const f of ['propiedades.csv', 'propiedades.xlsx']) {
    await fs.copyFile(path.join(path.dirname(config.csvFile), f), path.join(dir, f)).catch(() => {});
  }
  // Solo las fotos de leads activos
  const wanted = new Set(leads.flatMap((l) => l.imagenes_locales || []).map((p) => path.basename(String(p))));
  for (const name of await fs.readdir(path.join(dir, 'media'))) {
    if (!wanted.has(name)) await fs.rm(path.join(dir, 'media', name), { force: true });
  }
  for (const name of wanted) {
    await fs.copyFile(path.join(config.dirs.media, name), path.join(dir, 'media', name)).catch(() => {});
  }
  return dir;
}

async function write(file, data) {
  await fs.writeFile(`${file}.tmp`, data);
  await fs.rename(`${file}.tmp`, file);
}

export function startVista({ port = config.vistaPort, host = config.dashboardHost, token = config.vistaToken } = {}) {
  if (!token) return null;
  const prefix = `/v/${token}`;
  const server = http.createServer(async (req, res) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method !== 'GET' || !safeStartsWith(url.pathname, prefix)) throw notFound();
      const rest = url.pathname.slice(prefix.length);
      if (rest === '') return res.writeHead(301, { ...headers, Location: `${prefix}/` }).end();
      const name = decodeURIComponent(rest.replace(/^\//, ''));
      let file;
      let type;
      if (FILES[name]) [file, type] = FILES[name];
      else if (/^media\/[\w.-]+$/.test(name)) [file, type] = [name, 'image/jpeg'];
      else throw notFound();
      const data = await fs.readFile(path.join(config.dirs.vista, file)).catch(() => { throw notFound(); });
      res.writeHead(200, { ...headers, 'Content-Type': type });
      res.end(data);
    } catch {
      res.writeHead(404, { ...headers, 'Content-Type': 'text/plain' });
      res.end('No encontrado');
    }
  });
  server.listen(port, host, () => console.log(`Vista de solo lectura en el puerto ${port}`));
  return server;
}

/** Compara el prefijo con el token en tiempo constante. */
function safeStartsWith(pathname, prefix) {
  const head = Buffer.from(pathname.slice(0, prefix.length));
  const want = Buffer.from(prefix);
  return head.length === want.length && crypto.timingSafeEqual(head, want);
}

const notFound = () => Object.assign(new Error('No encontrado'), { status: 404 });
