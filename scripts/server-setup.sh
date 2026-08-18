#!/usr/bin/env bash
# 在轻量服务器上执行一次：安装 Node 20、Nginx、PM2，并配好反向代理。
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
APP_DIR="${APP_DIR:-/var/www/beiyexing}"
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

$SUDO apt-get update
$SUDO apt-get install -y git nginx build-essential python3 curl rsync

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v20\.|^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
  $SUDO apt-get install -y nodejs
fi

$SUDO npm install -g pm2

$SUDO mkdir -p "$APP_DIR" /var/backups/beiyexing
$SUDO chown -R "$(id -u)":"$(id -g)" "$APP_DIR"

if [ ! -f /swapfile ]; then
  $SUDO fallocate -l 1G /swapfile
  $SUDO chmod 600 /swapfile
  $SUDO mkswap /swapfile
  $SUDO swapon /swapfile
  echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
fi

if [ -f "$APP_DIR/scripts/nginx-beiyexing.conf" ]; then
  $SUDO cp "$APP_DIR/scripts/nginx-beiyexing.conf" /etc/nginx/sites-available/beiyexing
  $SUDO ln -sfn /etc/nginx/sites-available/beiyexing /etc/nginx/sites-enabled/beiyexing
  $SUDO rm -f /etc/nginx/sites-enabled/default
  $SUDO nginx -t
  $SUDO systemctl enable nginx
  $SUDO systemctl reload nginx
fi

echo "server-setup done: node $(node -v) npm $(npm -v)"
