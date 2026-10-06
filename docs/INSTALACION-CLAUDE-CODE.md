# Tarea para Claude Code (sesión local en Windows): instalar el Monitor de Propiedades de WhatsApp

## Contexto
- Equipo: Windows, con **Docker Desktop ya instalado y corriendo** (motor en verde).
- Proyecto: repositorio `rcacunnag-ctrl/Whatsapp-Lead-Generation`, rama **`claude/whatsapp-property-monitor-mvp-ctgbs3`**.
- Qué hace: monitorea grupos de WhatsApp, extrae propiedades en venta y las clasifica por condado (Palm Beach, Broward, Martin). Corre 100 % local en Docker y no usa APIs pagas.
- Interfaz final: panel en `http://localhost:3000` y Excel en `C:\monitor\data\propiedades.xlsx`.
- Shell: PowerShell. Carpeta destino: **`C:\monitor`**.

## Reglas
- Antes de cada paso, explica en una línea qué vas a hacer; después, reporta el resultado.
- No subas ni compartas `.env` ni la carpeta `auth\`: contienen la sesión de WhatsApp.
- No modifiques el código del proyecto. Si algo falla, muestra el error y propón la solución antes de aplicarla.
- Si `C:\monitor` ya existe, pregúntame antes de borrarla o sobrescribirla.

## Pasos

### 1. Verificar Docker
```powershell
docker --version
docker compose version
docker run --rm hello-world
```
Si falla, revisa que Docker Desktop esté abierto con el motor en verde y detente.

### 2. Obtener el proyecto en `C:\monitor`
- **Opción A (si `git` está instalado):**
  ```powershell
  git clone -b claude/whatsapp-property-monitor-mvp-ctgbs3 https://github.com/rcacunnag-ctrl/Whatsapp-Lead-Generation.git C:\monitor
  ```
  Si pide credenciales porque el repositorio es privado, usa la opción B.
- **Opción B (con el ZIP en Descargas):** busca `$HOME\Downloads\Whatsapp-Lead-Generation*.zip`, descomprímelo en una carpeta temporal y copia a `C:\monitor` la carpeta que contiene `package.json`. Después borra la carpeta temporal. Si no encuentras el ZIP, pídeme la ruta.

Verifica que `C:\monitor` contenga directamente `package.json`, `Dockerfile`, `docker-compose.yml` y `src\`.

### 3. Crear `.env`
1. Pregúntame el **número de WhatsApp** a vincular: código de país + número, sin "+", solo dígitos. Ejemplo: `15615551234`.
2. Copia `.env.example` a `.env` reemplazando la línea `WA_PHONE_NUMBER=...` por el número.
3. Deja `WA_GROUPS=` vacío.
4. Guarda el archivo **en UTF-8 sin BOM**, con `[IO.File]::WriteAllLines`.

### 4. Construir la imagen
```powershell
cd C:\monitor
docker compose build
```
La primera vez tarda entre 2 y 5 minutos. Debe terminar sin errores.

### 5. (Opcional, recomendado) Probar con un chat exportado, sin vincular WhatsApp
Pregúntame si tengo un chat exportado (WhatsApp > grupo > Más > Exportar chat > Incluir archivos). Si lo tengo:
1. Descomprímelo en `C:\monitor\data\import\`.
2. Ejecuta, usando el nombre real del .txt:
   ```powershell
   docker compose run --rm monitor node src/import-chat.js "/app/data/import/_chat.txt" --group "NOMBRE DEL GRUPO"
   ```
3. Repórtame cuántas propiedades detectó y cuántas quedaron "en zona".
4. El Excel queda en `C:\monitor\data\propiedades.xlsx`.

### 6. Vincular WhatsApp
Este paso requiere que yo actúe con el teléfono. Pídeme que abra **otra ventana de PowerShell** y ejecute:
```powershell
cd C:\monitor
docker compose run --rm monitor node src/index.js --list-groups
```
- Aparecerá un **código de 8 caracteres**. Yo lo ingreso en el teléfono: *WhatsApp > Dispositivos vinculados > Vincular dispositivo > Vincular con número de teléfono*.
- Al vincularse, el programa lista los grupos (JID y nombre) y termina.
- Si prefieres ejecutarlo tú, hazlo en segundo plano y muéstrame el código **apenas aparezca**, porque expira en pocos minutos.

### 7. Elegir grupos
Pregúntame qué grupos monitorear (nombre o parte del nombre, separados por coma) y actualiza en `.env` la línea `WA_GROUPS=...`. Ejemplo: `WA_GROUPS=Inversiones FL,Off Market Broward`.

### 8. Arrancar en modo continuo
```powershell
cd C:\monitor
docker compose up -d
docker compose logs --tail 30
```
Confirma que los logs digan **"Conectado a WhatsApp"** y **"Monitoreando N grupo(s)"**.

### 9. Verificar el panel
Abre `http://localhost:3000` (`Start-Process http://localhost:3000`) y confirma que carga.

### 10. Dejar el equipo listo para operar 24/7 (pídeme confirmación antes de cada cambio)
- Docker Desktop: *Settings > General > "Start Docker Desktop when you sign in"* activado. Indícame dónde está; es un ajuste de la interfaz.
- Evitar la suspensión con corriente:
  ```powershell
  powercfg /change standby-timeout-ac 0
  ```

## Resultado esperado (resúmemelo al final)
- [ ] Docker verificado
- [ ] Proyecto en `C:\monitor` y `.env` creado
- [ ] Imagen construida
- [ ] (Opcional) Chat histórico importado: N propiedades, N en zona
- [ ] WhatsApp vinculado y grupos configurados
- [ ] Monitor corriendo (`docker compose ps` = running)
- [ ] Panel accesible en http://localhost:3000

## Comandos de operación (déjamelos al final)
| Acción | Comando (en `C:\monitor`) |
|---|---|
| Ver actividad | `docker compose logs -f` |
| Reiniciar | `docker compose restart` |
| Detener | `docker compose down` |
| Abrir panel | `Start-Process http://localhost:3000` |
| Regenerar Excel | `docker compose run --rm monitor npm run excel` |
| Revincular otro número | `docker compose down`, borrar `C:\monitor\auth`, repetir pasos 6–8 |
