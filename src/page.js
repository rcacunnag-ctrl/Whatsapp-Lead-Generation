// Página del panel. Con window.SNAPSHOT (vista de solo lectura) usa esos datos y no muestra acciones.
export const PAGE = `<!doctype html>
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
#precioFields:not([hidden]){display:grid;grid-template-columns:1fr 1fr;gap:8px}
#toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--fg);color:var(--bg);padding:8px 14px;border-radius:8px;display:none;max-width:calc(100% - 32px)}
</style></head><body>
<header><h1>Monitor de Propiedades</h1><div class="kpis" id="kpis"></div></header>
<div class="bar">
<select id="estado"><option value="">Estado: todos</option></select>
<select id="condado"><option value="">Condado: todos</option></select>
<select id="dup"><option value="">Incluir duplicados</option><option value="NO">Ocultar duplicados</option></select>
<input id="q" placeholder="Buscar (calle, ciudad, grupo...)">
<a class="btn" id="dlXlsx" href="/descargar/xlsx">Descargar Excel</a><a class="btn" id="dlCsv" href="/descargar/csv">CSV</a><span class="m" id="upd"></span>
</div>
<div class="wrap"><table><thead><tr><th>Estado</th><th>Fecha</th><th>Condado</th><th>Dirección</th><th>Precio / ARV</th><th>Beds/Baths · Sqft</th><th>Tipo</th><th>Contacto</th><th>Grupo</th><th>Mensaje</th><th class="act">Acciones</th></tr></thead><tbody id="rows"></tbody></table></div>

<dialog id="dlg"><form method="dialog" id="frm">
<h2 id="dlgTitle"></h2><div class="m" id="dlgInfo"></div>
<div id="dirFields" hidden>
<label>Número y calle<input name="calle" placeholder="1234 NW 5th Ave"></label>
<label>Ciudad<input name="ciudad" placeholder="Fort Lauderdale"></label>
<label>ZIP<input name="zip" inputmode="numeric" maxlength="5" placeholder="33311"></label>
</div>
<div id="precioFields" hidden>
<label>Precio (asking)<input name="precio_usd" inputmode="decimal" placeholder="325000 o $325k"></label>
<label>ARV (opcional)<input name="arv_usd" inputmode="decimal" placeholder="480000 o $480k"></label>
</div>
<label>Usuario que ejecuta<select name="usuario" id="usuario"></select></label>
<div class="m" id="skillNote"></div>
<div class="row"><button value="cancel" formnovalidate>Cancelar</button><button value="ok" class="ok" id="dlgOk"></button></div>
</form></dialog>
<div id="toast"></div>

<script>
const ESTADOS=['Nuevo','Pendiente dirección','Revisar condado','Tier 1'];
const RO=!!window.RO,MEDIA=RO?'media/':'/media/';
let all=[],usuarios=[],skillOn=false,current=null;const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=n=>n?'$'+Number(n).toLocaleString('en-US'):'';
const links=s=>[].concat(s||[]).flatMap(x=>String(x).split(/\\n|,(?=https?)/)).filter(Boolean).map(u=>'<a href="'+esc(u)+'" target="_blank" rel="noopener">link</a>').join(' ');
const cls=e=>String(e||'').split(' ')[0];
const INF={pendiente:'en cola',en_proceso:'generando…',listo:'listo ✓',error:'error'};
const informe=r=>r.informe_estado?'<div class="m" title="'+esc([r.informe_ruta,r.informe_detalle].filter(Boolean).join(' · '))+'">Informe: '+esc(INF[r.informe_estado]||r.informe_estado)+'</div>':'';
const fullAddr=r=>[r.direccion,r.ciudad,(r.ciudad||r.zip)&&r.direccion?'FL '+(r.zip||''):r.zip].filter(Boolean).join(', ').trim()||'—';
function toast(t){const el=$('toast');el.textContent=t;el.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.display='none',4000)}
if(RO){document.querySelectorAll('.act').forEach(e=>e.remove());$('dlXlsx').href='propiedades.xlsx';$('dlCsv').href='propiedades.csv';document.title+=' (solo vista)'}
$('estado').innerHTML+=ESTADOS.map(e=>'<option>'+e+'</option>').join('');
async function load(){if($('dlg').open)return;const d=await (await fetch(RO?'datos.json?t='+Date.now():'/api/leads',{cache:'no-store'})).json();
 if(RO&&d.generado_en)$('upd').textContent='Actualizado: '+new Date(d.generado_en).toLocaleString();
 all=d.leads.slice().reverse();usuarios=d.usuarios||[];skillOn=!!d.skillHabilitado;
 const prev=localStorage.getItem('usuario');$('usuario').innerHTML=usuarios.map(u=>'<option'+(u===prev?' selected':'')+'>'+esc(u)+'</option>').join('');
 const cs=[...new Set(all.map(r=>r.condado).filter(Boolean))].sort(),cv=$('condado').value;
 $('condado').innerHTML='<option value="">Condado: todos</option>'+cs.map(c=>'<option'+(c===cv?' selected':'')+'>'+esc(c)+'</option>').join('');render()}
function actions(r){if(RO)return '';const b=[];
 if(r.estado==='Pendiente dirección'||r.estado==='Revisar condado')b.push('<button class="ok" data-a="direccion" data-id="'+r.id+'">'+(r.estado==='Revisar condado'?'Corregir dirección':'Agregar dirección')+'</button>');
 if((r.estado==='Nuevo'||r.estado==='Revisar condado')&&r.precio_usd)b.push('<button class="ok" data-a="tier1" data-id="'+r.id+'">Tier 1</button>');
 if(!r.precio_usd)b.push('<button class="ok" data-a="precio" data-id="'+r.id+'">Agregar precio</button>');
 if(r.estado==='Tier 1')b.push('<span class="m">'+esc(r.tier1_usuario||'')+'<br>'+esc((r.tier1_en||'').slice(0,10))+'</span>');
 b.push('<button class="del" data-a="descartar" data-id="'+r.id+'">Descartar</button>');return '<div class="acc">'+b.join('')+'</div>'}
function render(){const e=$('estado').value,c=$('condado').value,dup=$('dup').value,q=$('q').value.toLowerCase();
 const f=all.filter(r=>(!e||r.estado===e)&&(!c||r.condado===c)&&(!dup||r.duplicado==='NO')&&(!q||JSON.stringify(r).toLowerCase().includes(q)));
 $('kpis').innerHTML=[['',all.length,'Total'],...ESTADOS.map(s=>[s,all.filter(r=>r.estado===s).length,s])].map(([k,v,t])=>'<div class="kpi" data-e="'+esc(k)+'"><b>'+v+'</b><span class="m">'+esc(t)+'</span></div>').join('');
 $('rows').innerHTML=f.map(r=>'<tr><td><span class="e '+esc(cls(r.estado))+'">'+esc(r.estado)+'</span>'+informe(r)+'</td><td class="m">'+esc((r.fecha_mensaje||'').replace('T',' ').slice(0,16))+'</td><td>'+esc(r.condado||'—')+'<div class="m">'+esc(r.metodo_condado||'')+'</div></td><td>'+esc(fullAddr(r))+'<div class="m">'+esc(r.estado_direccion)+'</div>'+(r.duplicado&&r.duplicado!=='NO'?'<div class="m">Duplicado</div>':'')+(r.alerta?'<div class="alerta">⚠ '+esc(r.alerta)+(r.contacto||r.telefono?': '+esc(r.contacto||r.autor||'')+' '+(r.telefono?'<a href="tel:'+esc(r.telefono)+'">'+esc(r.telefono)+'</a>':''):'')+'</div>':'')+'</td><td>'+money(r.precio_usd)+(r.arv_usd?'<div class="m">ARV '+money(r.arv_usd)+'</div>':'')+'</td><td>'+esc([r.beds,r.baths].some(x=>x!=null&&x!=='')?(r.beds??'?')+'/'+(r.baths??'?'):'')+'<div class="m">'+esc(r.sqft?r.sqft+' sqft':'')+'</div></td><td>'+esc(r.tipo)+'<div class="m">'+esc(r.tipo_negocio)+'</div></td><td>'+esc(r.contacto||'')+'<div class="m">'+esc(r.telefono||'')+'</div></td><td class="m">'+esc(r.grupo)+'<br>'+esc(r.autor)+'</td><td><details><summary>'+esc(r.resumen)+'</summary><pre>'+esc(r.mensaje_original)+'</pre>'+(r.imagenes_locales||[]).map(p=>'<img src="'+MEDIA+encodeURIComponent(String(p).split(/[\\\\/]/).pop())+'">').join('')+' '+links(r.links_fotos)+' '+links(r.links_portales)+'</details></td>'+(RO?'':'<td>'+actions(r)+'</td>')+'</tr>').join('')||'<tr><td colspan="11" class="m">Sin resultados</td></tr>'}
async function post(id,a,body){const res=await fetch('/api/leads/'+id+'/'+a,{method:'POST',headers:{'Content-Type':'application/json','X-Monitor':'1'},body:JSON.stringify(body||{})});
 const d=await res.json().catch(()=>({}));if(!res.ok)throw new Error(d.error||'Error '+res.status);return d}
// Muestra un grupo de campos; los ocultos se deshabilitan para que no viajen en el formulario.
function show(id,on){$(id).hidden=!on;$(id).querySelectorAll('input,select').forEach(i=>i.disabled=!on)}
function openDlg(a,r){current={a,id:r.id};const f=$('frm'),dir=a==='direccion',pre=a==='precio',t1=a==='tier1';
 show('dirFields',dir);show('precioFields',pre);
 f.calle.value=dir&&r.estado==='Revisar condado'?(r.direccion||''):'';f.ciudad.value=dir?(r.ciudad||''):'';f.zip.value=dir?(r.zip||''):'';f.calle.required=dir;
 f.precio_usd.value=r.precio_usd??'';f.arv_usd.value=r.arv_usd??'';f.precio_usd.required=pre;
 $('dlgTitle').textContent={direccion:'Dirección del wholesaler',tier1:'Pasar a Tier 1',precio:'Precio del wholesaler'}[a];
 $('dlgInfo').textContent=dir?'Si está en Broward, Palm Beach o Martin pasa a Tier 1 (si falta el precio, queda como Nuevo hasta agregarlo); si no, se descarta.':fullAddr(r);
 $('skillNote').textContent=t1||dir?'Lanzar comp-analysis-report: '+(skillOn?'se enviará al PC del usuario elegido.':'por habilitar.'):'Queda registrado quién agregó el precio.';
 $('dlgOk').textContent={direccion:'Validar y continuar',tier1:'Pasar a Tier 1',precio:'Guardar precio'}[a];$('dlg').showModal()}
// Se guarda en el envío del formulario (no en el evento close del diálogo, que no siempre se dispara).
$('frm').addEventListener('submit',async ev=>{if(ev.submitter?.value!=='ok'||!current)return;const fd=Object.fromEntries(new FormData($('frm')));localStorage.setItem('usuario',fd.usuario);
 try{const d=await post(current.id,current.a,fd);toast(d.resultado==='descartado'?'Descartado: fuera de condado ('+(d.condado||'?')+')':d.resultado==='precio'?'Precio guardado':d.resultado==='falta_precio'?'Dirección guardada ('+(d.condado||'')+'). Falta el precio para pasar a Tier 1':'Lead en Tier 1'+(d.condado?' ('+d.condado+')':''))}catch(e){toast(e.message)}current=null;load()});
document.addEventListener('click',async ev=>{const k=ev.target.closest('.kpi');if(k){$('estado').value=k.dataset.e;render();return}
 const b=ev.target.closest('button[data-a]');if(!b)return;const r=all.find(x=>x.id===b.dataset.id);if(!r)return;
 if(b.dataset.a==='descartar'){if(!confirm('¿Descartar este lead? Se borra y la dirección no volverá a entrar.'))return;try{await post(r.id,'descartar');toast('Lead descartado')}catch(e){toast(e.message)}return load()}
 openDlg(b.dataset.a,r)});
['estado','condado','dup'].forEach(id=>$(id).onchange=render);$('q').oninput=render;load();setInterval(load,60000);
</script></body></html>`;
