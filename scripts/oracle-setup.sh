#!/usr/bin/env bash
# Prepara una VM Ubuntu (Oracle Cloud Always Free, ARM o AMD) para correr el monitor con Docker.
# Uso (en la VM):  bash scripts/oracle-setup.sh
set -euo pipefail

echo "==> Actualizando paquetes e instalando Docker"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"

echo "==> Swap de 2 GB (ayuda en VMs pequeñas al compilar/OCR)"
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> Zona horaria de Florida"
sudo timedatectl set-timezone America/New_York || true

cat <<'MSG'

Listo. Cierra sesión y vuelve a entrar (para usar docker sin sudo) y luego, dentro de la carpeta del proyecto:

  cp .env.example .env && nano .env          # WA_PHONE_NUMBER y luego WA_GROUPS
  docker compose build
  docker compose run --rm monitor node src/index.js --list-groups   # vincular + ver grupos
  docker compose up -d                         # dejarlo corriendo 24/7
  docker compose logs -f                       # ver actividad

Panel desde tu PC (túnel SSH, no abre puertos a internet):
  ssh -L 3000:localhost:3000 ubuntu@IP_DE_LA_VM    y abrir http://localhost:3000
MSG
