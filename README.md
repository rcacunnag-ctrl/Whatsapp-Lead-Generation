# WhatsApp Property Monitor (MVP piloto)

Lee los grupos de WhatsApp donde se publican propiedades en venta, extrae los datos con Claude y te dice si la propiedad está en **Palm Beach, Broward o Martin County**. Todo queda en Google Sheets.

```
WhatsApp (número vinculado, solo lectura)
   │  texto + fotos/flyers del mismo autor se agrupan (90 s)
   ▼
data/inbox/*.json  ──►  Claude (texto + visión)  ──►  US Census Geocoder  ──►  Google Sheets
   (cola)               dirección, precio, beds,       condado exacto;          pestaña "Propiedades"
                        baths, contacto, links          respaldo: tabla          (o data/propiedades.csv)
                                                        ciudad → condado
```

## Qué produce cada fila

| Columna | Valores |
|---|---|
| `en_zona` | `SI` (condado objetivo) · `NO` · `REVISAR` (sin ubicación o ciudad fronteriza, p. ej. Jupiter/Tequesta) |
| `estado_direccion` | `COMPLETA` · `PARCIAL` (solo ciudad/barrio) · `SIN DIRECCION` |
| `condado`, `metodo_condado` | Condado y cómo se obtuvo (`census_geocoder` o `city_table`) |
| `direccion_verificada` | Dirección normalizada por el Census (si hubo coincidencia) |
| `precio_usd`, `arv_usd`, `beds`, `baths`, `sqft`, `tipo`, `tipo_negocio`, `condicion` | Datos de la propiedad |
| `contacto`, `telefono`, `email`, `links_fotos`, `links_portales` | Quién publica y enlaces |
| `duplicado` | `NO` o `SI (visto <fecha> en <grupo>)`: la misma dirección ya llegó antes |
| `mensaje_original`, `imagenes_locales` | Para auditar la extracción |

Un mensaje con varias propiedades genera varias filas. Saludos y charla se descartan.

## Puesta en marcha (unos 30 minutos)

1. **Node 20+** (o Docker).
2. `cp .env.example .env` y completa:
   - `ANTHROPIC_API_KEY`: obtenla en console.anthropic.com.
   - `WA_PHONE_NUMBER`: el número que vas a vincular (recomendado: un número secundario unido a los grupos).
3. **Google Sheets** (opcional; si lo omites, se escribe un CSV):
   1. En Google Cloud, crea un proyecto, habilita *Google Sheets API* y crea una *cuenta de servicio*. Descarga su JSON como `service-account.json`.
   2. Crea una hoja, compártela con el email de la cuenta de servicio como **Editor** y pon el ID de la hoja (está en la URL) en `GOOGLE_SHEET_ID`.
4. `npm install`
5. **Vincular WhatsApp y ver los grupos:** `npm run groups`. Aparece un código de 8 caracteres; en el teléfono ve a *WhatsApp > Dispositivos vinculados > Vincular dispositivo > Vincular con número de teléfono*. El comando lista los grupos con su JID.
6. Pon en `WA_GROUPS` los JID o parte del nombre de los grupos, por ejemplo `WA_GROUPS=Inversiones FL,Off Market Broward`.
7. `npm start` (o `docker compose up -d`).

La sesión queda guardada en `auth/`, así que no hace falta volver a vincular. Para cambiar de número, borra `auth/` y vincula de nuevo.

## Probar sin conectar nada (recomendado como primer paso)

En el teléfono, abre el grupo y ve a *Más > Exportar chat > Incluir archivos*. Descomprime y ejecuta:

```bash
npm run import -- "ruta/_chat.txt" --group "Inversiones FL" --since 2026-09-01
```

Así mides la calidad de la extracción con datos reales e históricos antes de conectar el número. Si las fechas vienen en formato día/mes, agrega `--day-first`.

## Modo agendado / agente

- `PROCESS_MODE=realtime` (por defecto): procesa cada publicación al llegar.
- `PROCESS_MODE=batch`: el colector solo encola en `data/inbox/`, y `npm run process` procesa la cola. Este último se puede programar con cron, Task Scheduler o un agente agendado que corra en la misma máquina.

**Importante:** el colector de WhatsApp sí debe estar **encendido de forma continua** (es una sesión vinculada, como WhatsApp Web). Si está apagado, WhatsApp le entrega los mensajes pendientes al reconectar, pero WhatsApp puede desvincular dispositivos que pasan mucho tiempo desconectados (y desvincula todos si el teléfono principal no se usa en unos 14 días). Un agente en la nube que solo se activa por horario no puede mantener esa sesión. Por eso la arquitectura separa la captura (continua y liviana) del procesamiento (agendable).

## Riesgos y consideraciones

- **Términos de WhatsApp:** la conexión usa [Baileys](https://github.com/WhiskeySockets/Baileys), una librería no oficial. La API oficial de WhatsApp Business no permite leer grupos de un número personal. El monitor solo lee (nunca envía mensajes ni aparece "en línea"), lo que reduce el riesgo, pero Meta puede restringir el número. Por eso conviene un **número secundario**.
- **Privacidad:** la carpeta `auth/` equivale a tu sesión de WhatsApp. No la subas al repositorio (ya está en `.gitignore`).
- **Imágenes:** se guardan en `data/media/` y Claude las lee para extraer datos de los flyers (hasta 5 por publicación).
- **Costos:** Claude cobra por mensaje procesado; con pocas decenas de mensajes al día el costo es bajo. Para reducirlo puedes usar `CLAUDE_MODEL=claude-haiku-4-5`, pero valida antes la calidad con un export histórico. El Census Geocoder es gratuito.

## Estructura

```
src/index.js          colector WhatsApp (vinculación, filtro de grupos, agrupación texto+fotos)
src/whatsapp.js       conexión Baileys, lectura de texto e imágenes
src/extract.js        extracción estructurada con Claude (texto + visión)
src/geo.js            Census Geocoder → condado; respaldo por ciudad
src/counties.js       tabla ciudad → condado (Palm Beach, Broward, Martin)
src/pipeline.js       publicación → filas (zona, duplicados)
src/process-inbox.js  procesa la cola (data/inbox)
src/import-chat.js    importa chats exportados (.txt)
src/sink.js           Google Sheets o CSV
```

`npm test` ejecuta las pruebas de parser, condados, geocodificación y pipeline (sin red ni API key).

## Siguientes pasos sugeridos (después del piloto)

1. Medir durante 2 semanas: % de direcciones bien extraídas, % `REVISAR` y tasa de duplicados.
2. Alertas (correo o WhatsApp a ti mismo) solo para `en_zona = SI` + `COMPLETA` + `off_market`.
3. Enriquecer con datos del appraiser (BCPA / PAPA / Martin PA): dueño, valor tasado y última venta.
4. Pasar de Sheets a una base de datos (Postgres o Supabase) cuando haya varios usuarios.
