// Panel local (navegador): tabla filtrable de propiedades + descarga de Excel/CSV. Sin dependencias externas.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { readAllRows, exportXlsx } from './sink.js';

export function startDashboard({ port = config.dashboardPort, host = config.dashboardHost } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', PAGE);
      if (url.pathname === '/api/rows') return send(res, 200, 'application/json', JSON.stringify(await readAllRows()));
      if (url.pathname === '/descargar/csv') {
        const data = await fs.readFile(config.csvFile).catch(() => Buffer.from(''));
        return send(res, 200, 'text/csv; charset=utf-8', data, 'propiedades.csv');
      }
      if (url.pathname === '/descargar/xlsx') {
        const tmp = path.join(os.tmpdir(), `propiedades-${Date.now()}.xlsx`);
        await exportXlsx(tmp);
        const data = await fs.readFile(tmp);
        await fs.rm(tmp, { force: true });
        return send(res, 200, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data, 'propiedades.xlsx');
      }
      if (url.pathname.startsWith('/media/')) {
        const name = path.basename(decodeURIComponent(url.pathname.slice(7)));
        const data = await fs.readFile(path.join(config.dirs.media, name));
        return send(res, 200, 'image/jpeg', data);
      }
      send(res, 404, 'text/plain', 'No encontrado');
    } catch (err) {
      send(res, 500, 'text/plain', err.message);
    }
  });
  server.listen(port, host, () => console.log(`Panel: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
  return server;
}

function send(res, status, type, body, download) {
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  if (download) headers['Content-Disposition'] = `attachment; filename="${download}"`;
  res.writeHead(status, headers);
  res.end(body);
}

const PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monitor de Propiedades</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1b;--muted:#6b6b66;--line:#e3e3de;--si:#d7f0dc;--rev:#fff1c2;--no:#eeeeea;--accent:#1f6f50}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--fg:#ececea;--muted:#a3a39d;--line:#33332f;--si:#1e4a2b;--rev:#4d4116;--no:#2a2a27;--accent:#6fcf9f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
h1{font-size:18px;margin:0}.kpis{display:flex;gap:8px;flex-wrap:wrap}.kpi{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 12px}
.kpi b{font-size:18px;display:block}.bar{display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 12px}
select,input,a.btn{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:7px 10px;font:inherit}
a.btn{text-decoration:none;color:var(--accent);font-weight:600}.wrap{padding:0 16px 24px;overflow-x:auto}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px}
th,td{padding:8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{position:sticky;top:0;background:var(--card);font-size:12px;color:var(--muted)}
.z{border-radius:4px;padding:2px 6px;font-weight:600;font-size:12px}.z.SI{background:var(--si)}.z.REVISAR{background:var(--rev)}.z.NO{background:var(--no)}
details summary{cursor:pointer;color:var(--muted)}pre{white-space:pre-wrap;max-width:420px;margin:6px 0}.m{color:var(--muted);font-size:12px}
td img{max-height:60px;border-radius:4px;margin-right:4px}
</style></head><body>
<header><h1>Monitor de Propiedades</h1><div class="kpis" id="kpis"></div></header>
<div class="bar">
<select id="zona"><option value="">Zona: todas</option><option>SI</option><option>REVISAR</option><option>NO</option></select>
<select id="condado"><option value="">Condado: todos</option></select>
<select id="dir"><option value="">Dirección: todas</option><option>COMPLETA</option><option>PARCIAL</option><option>SIN DIRECCION</option></select>
<select id="dup"><option value="">Incluir duplicados</option><option value="NO">Ocultar duplicados</option></select>
<input id="q" placeholder="Buscar (calle, ciudad, grupo...)">
<a class="btn" href="/descargar/xlsx">Descargar Excel</a><a class="btn" href="/descargar/csv">CSV</a>
</div>
<div class="wrap"><table><thead><tr><th>Fecha</th><th>Zona</th><th>Condado</th><th>Dirección</th><th>Precio / ARV</th><th>Beds/Baths · Sqft</th><th>Tipo</th><th>Contacto</th><th>Grupo</th><th>Mensaje</th></tr></thead><tbody id="rows"></tbody></table></div>
<script>
let all=[];const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=n=>n?'$'+Number(n).toLocaleString('en-US'):'';
const links=s=>String(s||'').split(/\\n|,(?=https?)/).filter(Boolean).map(u=>'<a href="'+esc(u)+'" target="_blank" rel="noopener">link</a>').join(' ');
async function load(){all=(await (await fetch('/api/rows')).json()).reverse();
 const cs=[...new Set(all.map(r=>r.condado).filter(Boolean))].sort();$('condado').innerHTML='<option value="">Condado: todos</option>'+cs.map(c=>'<option>'+esc(c)+'</option>').join('');render()}
function render(){const z=$('zona').value,c=$('condado').value,d=$('dir').value,dup=$('dup').value,q=$('q').value.toLowerCase();
 const f=all.filter(r=>(!z||r.en_zona===z)&&(!c||r.condado===c)&&(!d||r.estado_direccion===d)&&(!dup||r.duplicado==='NO')&&(!q||JSON.stringify(r).toLowerCase().includes(q)));
 const n=k=>all.filter(r=>r.en_zona===k).length;
 $('kpis').innerHTML=[['Total',all.length],['En zona',n('SI')],['Revisar',n('REVISAR')],['Fuera',n('NO')]].map(([k,v])=>'<div class="kpi"><b>'+v+'</b><span class="m">'+k+'</span></div>').join('');
 $('rows').innerHTML=f.map(r=>'<tr><td class="m">'+esc((r.fecha_mensaje||'').replace('T',' ').slice(0,16))+'</td><td><span class="z '+esc(r.en_zona)+'">'+esc(r.en_zona)+'</span></td><td>'+esc(r.condado)+'<div class="m">'+esc(r.metodo_condado)+'</div></td><td>'+esc(r.direccion||'—')+'<div class="m">'+esc([r.ciudad,r.zip].filter(Boolean).join(' '))+' · '+esc(r.estado_direccion)+'</div>'+(r.duplicado&&r.duplicado!=='NO'?'<div class="m">Duplicado</div>':'')+'</td><td>'+money(r.precio_usd)+(r.arv_usd?'<div class="m">ARV '+money(r.arv_usd)+'</div>':'')+'</td><td>'+esc([r.beds,r.baths].some(x=>x!=null&&x!=='')?(r.beds??'?')+'/'+(r.baths??'?'):'')+'<div class="m">'+esc(r.sqft?r.sqft+' sqft':'')+'</div></td><td>'+esc(r.tipo)+'<div class="m">'+esc(r.tipo_negocio)+'</div></td><td>'+esc(r.contacto||'')+'<div class="m">'+esc(r.telefono||'')+'</div></td><td class="m">'+esc(r.grupo)+'<br>'+esc(r.autor)+'</td><td><details><summary>'+esc(r.resumen)+'</summary><pre>'+esc(r.mensaje_original)+'</pre>'+(r.imagenes_locales||[]).map(p=>'<img src="/media/'+encodeURIComponent(String(p).split(/[\\\\/]/).pop())+'">').join('')+' '+links(r.links_fotos)+' '+links(r.links_portales)+'</details></td></tr>').join('')||'<tr><td colspan="10" class="m">Sin resultados</td></tr>'}
['zona','condado','dir','dup'].forEach(id=>$(id).onchange=render);$('q').oninput=render;load();setInterval(load,60000);
</script></body></html>`;

if (import.meta.url === pathToFileURL(process.argv[1]).href) startDashboard();
