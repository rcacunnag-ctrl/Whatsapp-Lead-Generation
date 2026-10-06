# Plan: flujo de leads con reglas, acciones y Tier 1

Fecha: 2026-10-06 · Estado: **completado y desplegado en Oracle** (2026-10-06). Las casillas se marcan a medida que se completan.

## Reglas acordadas

| # | Caso | Resultado |
|---|---|---|
| R1 | Mensaje que no es anuncio | Se ignora |
| R2 | Sin dirección (no hay número + calle) y sin ARV | **Descarte automático** (no se guarda) |
| R3 | Sin dirección y con ARV | Entra como **Pendiente dirección** con la alerta "Solicitar dirección al wholesaler" |
| R4 | Con dirección en Broward, Palm Beach o Martin | Entra como **Nuevo** |
| R5 | Con dirección fuera de esos condados | **Descarte automático** |
| R6 | Con dirección, pero el condado no se puede determinar (ni por tablas ni por el geocodificador del Census) | Entra como **Revisar condado** y el usuario decide |
| R7 | Dirección ya descartada antes | No vuelve a entrar. Solo se guarda la dirección normalizada, sin otros datos |

"Dirección" significa número + calle (ej. `1234 NW 5th Ave`). Si el anuncio solo trae ciudad o ZIP, cuenta como sin dirección.

## Acciones del usuario en el panel

| Acción | Disponible en | Efecto |
|---|---|---|
| **Descartar** | Todos los estados | Se pide confirmación y se borra el lead del almacenamiento (y del Excel/CSV). Se guarda solo la dirección para cumplir R7 |
| **Tier 1** | Nuevo, Revisar condado | Se elige el usuario (Andres, Carlos o Jaime) y el estado pasa a **Tier 1** |
| **Agregar dirección** | Pendiente dirección (y Revisar condado, para corregirla) | El usuario escribe la dirección que le dio el wholesaler, el sistema valida el condado. Si está en zona, pasa a **Tier 1** con el usuario elegido. Si no, se **descarta** |

**Lanzar el skill `comp-analysis-report` al pasar a Tier 1:** queda creada pero **deshabilitada** (`TIER1_SKILL_ENABLED=false`). Cuando se active, deja un trabajo en `data/tier1-jobs/` con el lead y el usuario. Ese archivo lo recogerá el PC personal de Andres, Carlos o Jaime. Ese lado (el que ejecuta Claude en el PC personal) no está incluido en este plan.

## Pasos

### 1. Almacenamiento y reglas
- [x] 1.1 `src/leads.js`: almacén `data/leads.json` (leads activos + direcciones descartadas), con escritura atómica y operaciones de alta, descarte, Tier 1 y agregar dirección
- [x] 1.2 `src/pipeline.js`: aplicar R1–R7 al procesar cada mensaje
- [x] 1.3 Activar el geocodificador del Census (`USE_CENSUS_GEOCODER=true`) para R6
- [x] 1.4 Migración: los registros actuales de `propiedades.jsonl` pasan por las reglas una sola vez y el archivo original se conserva como `.bak`

### 2. Panel
- [x] 2.1 Quitar la columna y el filtro **Zona**. Agregar **Estado** con su filtro y contadores por estado
- [x] 2.2 Botones **Tier 1**, **Descartar** y **Agregar dirección**, con selector de usuario
- [x] 2.3 Alerta visible en los leads Pendiente dirección, con el contacto y el teléfono del wholesaler
- [x] 2.4 Protección básica de las acciones contra peticiones desde otros sitios. El acceso sigue limitado a Tailscale

### 3. Tier 1 → skill (deshabilitado)
- [x] 3.1 `src/tier1.js`: función `lanzarCompAnalysis(lead, usuario)` controlada por `TIER1_SKILL_ENABLED`
- [x] 3.2 Lista de usuarios configurable (`TIER1_USERS=Andres,Carlos,Jaime`)

### 4. Salidas
- [x] 4.1 El Excel y el CSV se regeneran desde `leads.json` en cada cambio, con la columna `estado` en lugar de `en_zona`

### 5. Pruebas y despliegue
- [x] 5.1 Pruebas automáticas de R1–R7 y de las tres acciones (`npm test`)
- [x] 5.2 Prueba manual del panel en local
- [x] 5.3 Desplegar en Oracle (`monitor-wa`) y verificar logs y panel por Tailscale

## Fuera de alcance por ahora
- El receptor en el PC personal que ejecuta el skill.
- La validación con IA. El flujo actual usa reglas.
- Login propio del panel. El acceso lo controla Tailscale.

## Bitácora
- 2026-10-06: plan creado. Decisiones: R6 = Census y, si no resuelve, Revisar condado. Dirección = número + calle. R7 = no reingresa.
- 2026-10-06: implementado (`src/leads.js`, `actions.js`, `tier1.js`, `migrate.js`; cambios en `pipeline.js`, `sink.js`, `dashboard.js`, `process-inbox.js`, `config.js`). Pruebas: 18/18 en Linux (la de OCR falla solo en Windows por la ruta del fixture, no por estos cambios). Prueba manual del panel con datos de ejemplo: migración, Tier 1, agregar dirección (en zona, fuera y sin determinar) y rechazo de peticiones externas (403).
- 2026-10-06: desplegado en `monitor-wa`. Respaldo previo en `~/monitor/data.bak-*`. La migración pasó 2 filas a 2 leads. El de Lake Wales (Polk) quedó en "Revisar condado" porque la migración no vuelve a geocodificar: se descarta a mano.
- Pendiente conocido: un lead "Pendiente dirección" descartado no deja dirección que recordar, así que si se republica vuelve a entrar.
