// Panel local (navegador): leads filtrables, acciones (Tier 1, descartar, agregar dirección) y descarga de Excel/CSV.
// Sin dependencias externas. No tiene login: el acceso se limita por red (localhost o Tailscale).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { exportXlsx } from './sink.js';
import { listLeads } from './leads.js';
import { descartar, pasarATier1, agregarDireccion } from './actions.js';
import { migrateLegacy } from './migrate.js';

const ACTIONS = {
  descartar: (id) => descartar(id),
  tier1: (id, body) => pasarATier1(id, body.usuario),
  direccion: (id, body) => agregarDireccion(id, body, body.usuario),
};

export function startDashboard({ port = config.dashboardPort, host = config.dashboardHost } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'POST') {
        const m = url.pathname.match(/^\/api\/leads\/([\w-]+)\/(descartar|tier1|direccion)$/);
        if (!m) return send(res, 404, 'text/plain', 'No encontrado');
        checkSameOrigin(req);
        const out = await ACTIONS[m[2]](m[1], await readJson(req));
        return send(res, 200, 'application/json', JSON.stringify(out));
      }
      if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', PAGE);
      if (url.pathname === '/api/leads') {
        const body = { leads: await listLeads(), usuarios: config.tier1Users, skillHabilitado: config.tier1SkillEnabled };
        return send(res, 200, 'application/json', JSON.stringify(body));
      }
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
      const status = err.status || 500;
      send(res, status, 'application/json', JSON.stringify({ error: err.message }));
    }
  });
  server.listen(port, host, () => console.log(`Panel: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
  return server;
}

/**
 * Las acciones solo se aceptan desde el propio panel: JSON con la cabecera X-Monitor
 * (otro sitio no puede enviarla sin preflight CORS, que este servidor no autoriza) y Origin igual al Host.
 */
function checkSameOrigin(req) {
  const ok = req.headers['x-monitor'] === '1' && /^application\/json/.test(req.headers['content-type'] || '');
  const origin = req.headers.origin;
  if (!ok || (origin && new URL(origin).host !== req.headers.host)) {
    throw Object.assign(new Error('Petición no permitida'), { status: 403 });
  }
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 });
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error('JSON inválido'), { status: 400 });
  }
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
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1b;--muted:#6b6b66;--line:#e3e3de;--nuevo:#e3eefc;--pend:#fff1c2;--rev:#fce4d6;--t1:#d7f0dc;--accent:#1f6f50;--danger:#a3322b}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--fg:#ececea;--muted:#a3a39d;--line:#33332f;--nuevo:#1d3550;--pend:#4d4116;--rev:#4d2c1a;--t1:#1e4a2b;--accent:#6fcf9f;--danger:#f08a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
h1{font-size:18px;margin:0}.kpis{display:flex;gap:8px;flex-wrap:wrap}.kpi{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer}
.kpi b{font-size:18px;display:block}.bar{display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 12px}
select,input,a.btn,button{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:7px 10px;font:inherit}
button{cursor:pointer}a.btn{text-decoration:none;color:var(--accent);font-weight:600}
button.ok{border-color:var(--accent);color:var(--accent);font-weight:600}button.del{color:var(--danger)}
.wrap{padding:0 16px 24px;overflow-x:auto}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px}
th,td{padding:8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{position:sticky;top:0;background:var(--card);font-size:12px;color:var(--muted)}
.e{border-radius:4px;padding:2px 6px;font-weight:600;font-size:12px;white-space:nowrap}
.e.Nuevo{background:var(--nuevo)}.e.Pendiente{background:var(--pend)}.e.Revisar{background:var(--rev)}.e.Tier{background:var(--t1)}
.alerta{margin-top:6px;padding:6px 8px;border-radius:6px;background:var(--pend);font-size:12px}
.acc{display:flex;flex-direction:column;gap:6px;min-width:120px}
details summary{cursor:pointer;color:var(--muted)}pre{white-space:pre-wrap;max-width:420px;margin:6px 0}.m{color:var(--muted);font-size:12px}
td img{max-height:60px;border-radius:4px;margin-right:4px}
dialog{border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);padding:18px;max-width:420px;width:calc(100% - 32px)}
dialog form{display:flex;flex-direction:column;gap:10px}dialog h2{font-size:16px;margin:0}dialog .row{display:flex;gap:8px;justify-content:flex-end}
dialog label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)}
#toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--fg);color:var(--bg);padding:8px 14px;border-radius:8px;display:none;max-width:calc(100% - 32px)}
</style></head><body>
<header><h1>Monitor de Propiedades</h1><div class="kpis" id="kpis"></div></header>
<div class="bar">
<select id="estado"><option value="">Estado: todos</option></select>
<select id="condado"><option value="">Condado: todos</option></select>
<select id="dup"><option value="">Incluir duplicados</option><option value="NO">Ocultar duplicados</option></select>
<input id="q" placeholder="Buscar (calle, ciudad, grupo...)">
<a class="btn" href="/descargar/xlsx">Descargar Excel</a><a class="btn" href="/descargar/csv">CSV</a>
</div>
<div class="wrap"><table><thead><tr><th>Estado</th><th>Fecha</th><th>Condado</th><th>Dirección</th><th>Precio / ARV</th><th>Beds/Baths · Sqft</th><th>Tipo</th><th>Contacto</th><th>Grupo</th><th>Mensaje</th><th>Acciones</th></tr></thead><tbody id="rows"></tbody></table></div>

<dialog id="dlg"><form method="dialog" id="frm">
<h2 id="dlgTitle"></h2><div class="m" id="dlgInfo"></div>
<div id="dirFields" hidden>
<label>Número y calle<input name="calle" placeholder="1234 NW 5th Ave"></label>
<label>Ciudad<input name="ciudad" placeholder="Fort Lauderdale"></label>
<label>ZIP<input name="zip" inputmode="numeric" maxlength="5" placeholder="33311"></label>
</div>
<label>Usuario que ejecuta<select name="usuario" id="usuario"></select></label>
<div class="m" id="skillNote"></div>
<div class="row"><button value="cancel" formnovalidate>Cancelar</button><button value="ok" class="ok" id="dlgOk"></button></div>
</form></dialog>
<div id="toast"></div>

<script>
const ESTADOS=['Nuevo','Pendiente dirección','Revisar condado','Tier 1'];
let all=[],usuarios=[],skillOn=false,current=null;const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=n=>n?'$'+Number(n).toLocaleString('en-US'):'';
const links=s=>[].concat(s||[]).flatMap(x=>String(x).split(/\\n|,(?=https?)/)).filter(Boolean).map(u=>'<a href="'+esc(u)+'" target="_blank" rel="noopener">link</a>').join(' ');
const cls=e=>String(e||'').split(' ')[0];
function toast(t){const el=$('toast');el.textContent=t;el.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.display='none',4000)}
$('estado').innerHTML+=ESTADOS.map(e=>'<option>'+e+'</option>').join('');
async function load(){if($('dlg').open)return;const d=await (await fetch('/api/leads')).json();
 all=d.leads.slice().reverse();usuarios=d.usuarios;skillOn=d.skillHabilitado;
 const prev=localStorage.getItem('usuario');$('usuario').innerHTML=usuarios.map(u=>'<option'+(u===prev?' selected':'')+'>'+esc(u)+'</option>').join('');
 const cs=[...new Set(all.map(r=>r.condado).filter(Boolean))].sort(),cv=$('condado').value;
 $('condado').innerHTML='<option value="">Condado: todos</option>'+cs.map(c=>'<option'+(c===cv?' selected':'')+'>'+esc(c)+'</option>').join('');render()}
function actions(r){const b=[];
 if(r.estado==='Pendiente dirección'||r.estado==='Revisar condado')b.push('<button class="ok" data-a="direccion" data-id="'+r.id+'">'+(r.estado==='Revisar condado'?'Corregir dirección':'Agregar dirección')+'</button>');
 if(r.estado==='Nuevo'||r.estado==='Revisar condado')b.push('<button class="ok" data-a="tier1" data-id="'+r.id+'">Tier 1</button>');
 if(r.estado==='Tier 1')b.push('<span class="m">'+esc(r.tier1_usuario||'')+'<br>'+esc((r.tier1_en||'').slice(0,10))+'</span>');
 b.push('<button class="del" data-a="descartar" data-id="'+r.id+'">Descartar</button>');return '<div class="acc">'+b.join('')+'</div>'}
function render(){const e=$('estado').value,c=$('condado').value,dup=$('dup').value,q=$('q').value.toLowerCase();
 const f=all.filter(r=>(!e||r.estado===e)&&(!c||r.condado===c)&&(!dup||r.duplicado==='NO')&&(!q||JSON.stringify(r).toLowerCase().includes(q)));
 $('kpis').innerHTML=[['',all.length,'Total'],...ESTADOS.map(s=>[s,all.filter(r=>r.estado===s).length,s])].map(([k,v,t])=>'<div class="kpi" data-e="'+esc(k)+'"><b>'+v+'</b><span class="m">'+esc(t)+'</span></div>').join('');
 $('rows').innerHTML=f.map(r=>'<tr><td><span class="e '+esc(cls(r.estado))+'">'+esc(r.estado)+'</span></td><td class="m">'+esc((r.fecha_mensaje||'').replace('T',' ').slice(0,16))+'</td><td>'+esc(r.condado||'—')+'<div class="m">'+esc(r.metodo_condado||'')+'</div></td><td>'+esc(r.direccion||'—')+'<div class="m">'+esc([r.ciudad,r.zip].filter(Boolean).join(' '))+' · '+esc(r.estado_direccion)+'</div>'+(r.duplicado&&r.duplicado!=='NO'?'<div class="m">Duplicado</div>':'')+(r.alerta?'<div class="alerta">⚠ '+esc(r.alerta)+(r.contacto||r.telefono?': '+esc(r.contacto||r.autor||'')+' '+(r.telefono?'<a href="tel:'+esc(r.telefono)+'">'+esc(r.telefono)+'</a>':''):'')+'</div>':'')+'</td><td>'+money(r.precio_usd)+(r.arv_usd?'<div class="m">ARV '+money(r.arv_usd)+'</div>':'')+'</td><td>'+esc([r.beds,r.baths].some(x=>x!=null&&x!=='')?(r.beds??'?')+'/'+(r.baths??'?'):'')+'<div class="m">'+esc(r.sqft?r.sqft+' sqft':'')+'</div></td><td>'+esc(r.tipo)+'<div class="m">'+esc(r.tipo_negocio)+'</div></td><td>'+esc(r.contacto||'')+'<div class="m">'+esc(r.telefono||'')+'</div></td><td class="m">'+esc(r.grupo)+'<br>'+esc(r.autor)+'</td><td><details><summary>'+esc(r.resumen)+'</summary><pre>'+esc(r.mensaje_original)+'</pre>'+(r.imagenes_locales||[]).map(p=>'<img src="/media/'+encodeURIComponent(String(p).split(/[\\\\/]/).pop())+'">').join('')+' '+links(r.links_fotos)+' '+links(r.links_portales)+'</details></td><td>'+actions(r)+'</td></tr>').join('')||'<tr><td colspan="11" class="m">Sin resultados</td></tr>'}
async function post(id,a,body){const res=await fetch('/api/leads/'+id+'/'+a,{method:'POST',headers:{'Content-Type':'application/json','X-Monitor':'1'},body:JSON.stringify(body||{})});
 const d=await res.json().catch(()=>({}));if(!res.ok)throw new Error(d.error||'Error '+res.status);return d}
function openDlg(a,r){current={a,id:r.id};const dir=a==='direccion';$('dirFields').hidden=!dir;
 $('frm').calle.value=dir&&r.estado==='Revisar condado'?(r.direccion||''):'';$('frm').ciudad.value=dir?(r.ciudad||''):'';$('frm').zip.value=dir?(r.zip||''):'';$('frm').calle.required=dir;
 $('dlgTitle').textContent=dir?'Dirección del wholesaler':'Pasar a Tier 1';
 $('dlgInfo').textContent=dir?'Si está en Broward, Palm Beach o Martin pasa a Tier 1; si no, se descarta.':(r.direccion||'')+' '+(r.ciudad||'');
 $('skillNote').textContent='Lanzar comp-analysis-report: '+(skillOn?'se enviará al PC del usuario elegido.':'por habilitar.');
 $('dlgOk').textContent=dir?'Validar y continuar':'Pasar a Tier 1';$('dlg').showModal()}
$('dlg').addEventListener('close',async()=>{if($('dlg').returnValue!=='ok'||!current)return;const fd=Object.fromEntries(new FormData($('frm')));localStorage.setItem('usuario',fd.usuario);
 try{const d=await post(current.id,current.a,fd);toast(d.resultado==='descartado'?'Descartado: fuera de condado ('+(d.condado||'?')+')':'Lead en Tier 1'+(d.condado?' ('+d.condado+')':''))}catch(e){toast(e.message)}current=null;load()});
document.addEventListener('click',async ev=>{const k=ev.target.closest('.kpi');if(k){$('estado').value=k.dataset.e;render();return}
 const b=ev.target.closest('button[data-a]');if(!b)return;const r=all.find(x=>x.id===b.dataset.id);if(!r)return;
 if(b.dataset.a==='descartar'){if(!confirm('¿Descartar este lead? Se borra y la dirección no volverá a entrar.'))return;try{await post(r.id,'descartar');toast('Lead descartado')}catch(e){toast(e.message)}return load()}
 openDlg(b.dataset.a,r)});
['estado','condado','dup'].forEach(id=>$(id).onchange=render);$('q').oninput=render;load();setInterval(load,60000);
</script></body></html>`;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await migrateLegacy();
  startDashboard();
}
