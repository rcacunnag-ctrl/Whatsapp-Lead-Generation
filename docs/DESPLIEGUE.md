# Despliegue: ¿dónde corre el monitor?

El monitor tiene que estar **encendido 24/7**, porque funciona como un "WhatsApp Web" que escucha los grupos. Hay tres opciones, todas sin costo de software:

| Opción | Costo | Pros | Contras |
|---|---|---|---|
| **A. Docker en tu PC/Mac** | $0 | Arranca en 15 min; todo queda en tu máquina | Solo captura mientras la PC está encendida y sin suspender |
| **B. Oracle Cloud Always Free** | $0 (pide tarjeta para verificar identidad) | 24/7; buen tamaño (ARM, 2 OCPU / 12 GB) | Hay que crear la cuenta y la VM; Oracle puede reclamar VMs gratuitas que pasan inactivas |
| C. Mini PC o Raspberry Pi en la oficina | Hardware único (~$80–150) | 24/7 y local | Hardware que mantener |

**Recomendación:** empieza con **A** para el piloto (validar la calidad de la extracción) y pasa a **B** cuando quieras captura continua o entregarlo a un usuario final.

---

## A. Docker local (Windows / Mac)

1. Instala **Docker Desktop**: https://www.docker.com/products/docker-desktop/. En Windows requiere WSL2; el instalador lo activa. Docker Desktop es gratuito para uso personal y para empresas con menos de 250 empleados **y** menos de US$10M de ingresos anuales. Si tu grupo supera cualquiera de esos dos límites, necesita licencia: en ese caso usa la opción B o instala Node directamente (ver más abajo).
2. Descarga el proyecto, abre una terminal en la carpeta y ejecuta:
   ```bash
   cp .env.example .env        # en Windows: copy .env.example .env
   # edita .env: WA_PHONE_NUMBER=1561XXXXXXX
   docker compose build
   docker compose run --rm monitor node src/index.js --list-groups
   ```
3. Aparece un **código de 8 caracteres**. En el teléfono: *WhatsApp > Dispositivos vinculados > Vincular dispositivo > Vincular con número de teléfono* e ingresa el código. Luego se listan tus grupos.
4. Pon en `.env` → `WA_GROUPS=` los nombres (o parte del nombre) de los grupos y ejecuta:
   ```bash
   docker compose up -d
   ```
5. Abre **http://localhost:3000**: ahí está el panel, con la tabla, los filtros y el botón *Descargar Excel*.
   Los archivos también quedan en `data/` (`propiedades.xlsx`, `propiedades.csv`).

En Windows, desactiva la suspensión del equipo (*Configuración > Energía*) mientras corra el piloto.

**Sin Docker:** instala Node.js 22 LTS y ejecuta `npm install`, `npm run groups` y `npm start`.

---

## B. Oracle Cloud Always Free

### 1. Crear la cuenta
1. Regístrate en https://www.oracle.com/cloud/free/ con un correo distinto al de cualquier cuenta Oracle anterior.
2. Elige la **Home Region** con cuidado, porque **no se puede cambiar**. Para Florida, *US East (Ashburn)* es la más cercana. Si no hay capacidad ARM, otras regiones de EE. UU. también sirven.
3. Oracle pide tarjeta de crédito para verificar identidad; no cobra mientras uses recursos *Always Free*.

### 2. Evitar que Oracle reclame la VM (importante)
Oracle puede **reclamar instancias Always Free que considera inactivas** (CPU, red y memoria muy bajas durante 7 días). Este monitor usa muy poca CPU, así que corre ese riesgo. Dos alternativas:
- **Recomendado:** convertir la cuenta a **Pay As You Go**. Sigues pagando $0 mientras te mantengas dentro de los límites Always Free. La documentación de Oracle aplica la reclamación por inactividad a las cuentas solo gratuitas, y la comunidad reporta que deja de ocurrir tras el cambio a Pay As You Go; confírmalo en la consola al hacerlo. Antes, crea un **presupuesto con alerta en US$1** (*Billing > Budgets*) para enterarte de cualquier cargo.
- Mantener la cuenta solo gratuita y vigilar los correos de aviso de Oracle.

### 3. Crear la VM
*Compute > Instances > Create instance*:
- **Imagen:** Ubuntu 24.04.
- **Shape:** *Ampere A1 (VM.Standard.A1.Flex)* con 1 OCPU y 6 GB de RAM; sobra para este proyecto. Si sale "Out of capacity", intenta más tarde, en otro Availability Domain, o usa *VM.Standard.E2.1.Micro* (AMD, 1 GB de RAM, más justa pero funciona con OCR).
- **SSH:** descarga la llave privada que te genera.
- **Red:** deja la VCN por defecto. **No abras puertos adicionales**: al panel se entra por túnel SSH.

### 4. Instalar y arrancar
```bash
ssh -i llave.key ubuntu@IP_PUBLICA
git clone https://github.com/rcacunnag-ctrl/Whatsapp-Lead-Generation.git monitor && cd monitor
bash scripts/oracle-setup.sh          # instala Docker, swap y zona horaria
exit                                   # vuelve a entrar para aplicar permisos
ssh -i llave.key ubuntu@IP_PUBLICA
cd monitor && cp .env.example .env && nano .env
docker compose build
docker compose run --rm monitor node src/index.js --list-groups   # código de vinculación
nano .env                              # WA_GROUPS=...
docker compose up -d
```
Si el repositorio es privado, `git clone` pedirá un *Personal Access Token* de GitHub como contraseña. También puedes copiar la carpeta con `scp`.

### 5. Ver el panel desde tu PC
```bash
ssh -i llave.key -L 3000:localhost:3000 ubuntu@IP_PUBLICA
```
Abre **http://localhost:3000** en tu navegador mientras la sesión SSH esté abierta. Para bajar el Excel por otra vía: `scp -i llave.key ubuntu@IP_PUBLICA:monitor/data/propiedades.xlsx .`

### Operación
- `docker compose logs -f`: ver actividad.
- `docker compose restart`: reiniciar.
- `git pull && docker compose up -d --build`: actualizar.
- **Respaldo:** las carpetas `data/` (resultados) y `auth/` (sesión de WhatsApp; trátala como una contraseña).

---

## Entrega a un usuario final
El paquete es la carpeta del proyecto más su `.env`. El usuario final:
1. Vincula **su** número con `--list-groups`.
2. Elige sus grupos en `WA_GROUPS`.
3. Usa el panel o el Excel.

No hay cuentas de terceros, API keys ni costos variables que transferir.
