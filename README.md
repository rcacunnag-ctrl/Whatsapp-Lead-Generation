# WhatsApp Property Monitor (MVP piloto)

Lee los grupos de WhatsApp donde se publican propiedades en venta, extrae los datos de cada anuncio y te dice si la propiedad está en **Palm Beach, Broward o Martin County**.

**Única dependencia externa: WhatsApp.** No usa APIs de pago ni cuentas en la nube. La extracción, el OCR de flyers, la clasificación por condado, el Excel y el panel corren en tu máquina.

```
WhatsApp (número vinculado, solo lectura)
   │  texto + fotos/flyers del mismo autor se agrupan (90 s)
   ▼
data/inbox  ──►  reglas de extracción  ──►  condado por ZIP / ciudad  ──►  propiedades.xlsx / .csv
                 + OCR local (flyers)        (tablas offline)               + panel http://localhost:3000
```

## Interfaz

1. **Panel web local** (`http://localhost:3000`): tabla con filtros (zona, condado, estado de dirección, duplicados, búsqueda), contadores y botón **Descargar Excel**. Se actualiza solo cada minuto. Es la vista para el día a día.
2. **Excel** `data/propiedades.xlsx`: se regenera después de cada lote. Tiene filtros, encabezado fijo y la columna de zona en colores. También hay un `propiedades.csv` que se va acumulando.

## Qué produce cada fila

| Columna | Valores |
|---|---|
| `en_zona` | `SI` (condado objetivo) · `NO` · `REVISAR` (sin ubicación, ZIP fronterizo, o ZIP y ciudad que no coinciden) |
| `estado_direccion` | `COMPLETA` (número + calle + ciudad/ZIP) · `PARCIAL` (solo ciudad/ZIP o solo calle) · `SIN DIRECCION` |
| `condado`, `metodo_condado` | Condado y cómo se obtuvo (`zip_table`, `city_table`, opcional `census_geocoder`) |
| `precio_usd`, `arv_usd`, `beds`, `baths`, `sqft`, `lote_sqft`, `anio` | Datos numéricos del anuncio |
| `tipo`, `tipo_negocio`, `condicion` | single_family/condo/duplex…, off_market/wholesale/mls…, "needs rehab", "turnkey"… |
| `contacto`, `telefono`, `email`, `links_fotos`, `links_portales` | Quién publica y enlaces (Drive/Google Photos vs Zillow/Redfin/MLS) |
| `duplicado` | `NO` o `SI (visto <fecha> en <grupo>)` |
| `mensaje_original`, `texto_ocr`, `imagenes_locales` | Para auditar la extracción |

Un mensaje con varias direcciones genera varias filas. Saludos, charla y preguntas se descartan.

## Puesta en marcha

Guía completa, con **Docker local** y **Oracle Cloud Always Free**: [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

Versión rápida, con Node 20+ o Docker:
```bash
cp .env.example .env              # WA_PHONE_NUMBER=1561XXXXXXX
npm install
npm run groups                    # muestra un código: WhatsApp > Dispositivos vinculados > Vincular con número
# poner en .env -> WA_GROUPS=Inversiones FL,Off Market Broward
npm start                         # captura + panel en http://localhost:3000
```

## Probar primero con histórico, sin vincular nada

En el teléfono: *Grupo > Más > Exportar chat > Incluir archivos*. Descomprime y ejecuta:
```bash
npm run import -- "ruta/_chat.txt" --group "Inversiones FL" --since 2026-09-01
npm run panel                     # revisar resultados en http://localhost:3000
```
Si las fechas del export vienen como día/mes, agrega `--day-first`.

## Cómo extrae sin IA (y sus límites)

- **Dirección:** detecta el patrón número + calle + sufijo (`1234 NW 5th Ave`, `4521 SE Murray St`, `A1A`, `US-1`, `Unit/Apt/#`) y busca ciudad y ZIP justo después.
- **Condado:** usa una tabla ZIP → condado de los tres condados, después una tabla de ciudades, que incluye ciudades de Miami-Dade, St. Lucie y otros condados para poder marcar `NO` con seguridad.
- **Precio, ARV, 3/2, "3 bed 2 bath", "3 hab 2 baños", sqft, lote, año, teléfono, email y links:** se reconocen con patrones en inglés y español.
- **Flyers:** el OCR local (Tesseract) lee el texto de las imágenes. Funciona bien con flyers de texto claro y peor con diseños muy recargados. Se puede desactivar con `OCR_ENABLED=false`.
- **Límite:** las reglas aciertan en los formatos habituales, pero un anuncio redactado de forma muy libre puede quedar `PARCIAL` o `REVISAR`. Para eso están `mensaje_original` y el filtro *Revisar* del panel.
- **Opcional, gratis:** `USE_CENSUS_GEOCODER=true` confirma el condado con el geocodificador del US Census (sin API key) solo en los casos dudosos. Requiere internet en la máquina.

## ¿Y Claude?

No es necesario para operar: el sistema corre solo. Si más adelante quieres un **revisor programado** (por ejemplo, un resumen diario de los leads `SI`, o corregir los `REVISAR`), se puede agregar como paso opcional que lee `propiedades.xlsx`. Puede ser con tu suscripción de Claude, apuntando a una carpeta sincronizada, sin pagar API.

## Riesgos

- **Términos de WhatsApp:** la conexión usa [Baileys](https://github.com/WhiskeySockets/Baileys), una librería no oficial. La API oficial de WhatsApp Business no permite leer grupos de un número personal. El monitor solo lee: nunca envía mensajes ni aparece "en línea". Aun así, Meta puede restringir el número, por lo que se recomienda un **número secundario**.
- **Sesión:** la carpeta `auth/` equivale a tu sesión de WhatsApp. No la compartas; ya está en `.gitignore`.
- **Disponibilidad:** el colector debe estar encendido. Si se apaga, WhatsApp le entrega los mensajes pendientes al reconectar, pero puede desvincular dispositivos que pasan mucho tiempo desconectados.

## Estructura

```
src/index.js          colector WhatsApp + panel (vinculación, filtro de grupos, agrupación texto+fotos)
src/whatsapp.js       conexión Baileys, lectura de texto e imágenes
src/extract.js        extracción por reglas (dirección, precio, beds/baths, contacto, links, tipo)
src/ocr.js            OCR local de flyers (Tesseract WASM, sin internet)
src/counties.js       tablas ZIP/ciudad → condado
src/geo.js            resolución de condado (offline; Census opcional)
src/pipeline.js       publicación → filas (zona, duplicados)
src/process-inbox.js  procesa la cola data/inbox y regenera el Excel
src/import-chat.js    importa chats exportados (.txt)
src/sink.js           JSONL + CSV + XLSX
src/dashboard.js      panel web local
scripts/oracle-setup.sh  prepara una VM Ubuntu (Docker, swap, zona horaria)
```

`npm test` ejecuta 16 pruebas (extracción, OCR, condados, parser de chats, pipeline y salida), sin red.

## Siguientes pasos sugeridos

1. Correr 2 semanas y medir: % de direcciones `COMPLETA`, % `REVISAR` y tasa de duplicados.
2. Ajustar las reglas con los casos que fallen: se agregan como prueba en `test/core.test.js`.
3. Alerta (por ejemplo, un mensaje a ti mismo) solo para `SI` + `COMPLETA` + `off_market`.
4. Cruzar con los datos del appraiser (BCPA / PAPA / Martin PA).
