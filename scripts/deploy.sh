#!/usr/bin/env bash
# 在本机项目根目录执行：把代码同步到腾讯云轻量服务器并启动。
# 用法：./scripts/deploy.sh
# 可选环境变量：DEPLOY_HOST DEPLOY_USER DEPLOY_DIR DEPLOY_SSH_KEY
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-192.144.167.212}"
USER="${DEPLOY_USER:-ubuntu}"
DIR="${DEPLOY_DIR:-/var/www/beiyexing}"
KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 "$USER@$HOST")
RSYNC_SSH="ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes"

cd "$ROOT"

if ! "${SSH[@]}" "echo ok" >/dev/null; then
  cat <<EOF
无法免密登录 $USER@$HOST。

腾讯云 Ubuntu 轻量机默认用户是 ubuntu，不是 root。
请确认已绑定本机公钥 ~/.ssh/id_ed25519.pub，然后执行：

  ssh -i ~/.ssh/id_ed25519 ubuntu@$HOST
EOF
  exit 1
fi

echo "==> 同步代码到 $USER@$HOST:$DIR"
"${SSH[@]}" "sudo mkdir -p '$DIR' && sudo chown -R '$USER:$USER' '$DIR'"
rsync -az --delete -e "$RSYNC_SSH" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'web/node_modules/' \
  --exclude 'server/node_modules/' \
  --exclude 'web/dist/' \
  --exclude 'coverage/' \
  --exclude 'server/coverage/' \
  --exclude 'server/data/*.sqlite' \
  --exclude 'server/data/*.sqlite-*' \
  --exclude 'server/public/static/uploads/' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.DS_Store' \
  "$ROOT/" "$USER@$HOST:$DIR/"

echo "==> 远程安装依赖并启动"
"${SSH[@]}" bash -s -- "$DIR" "$HOST" <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
DIR="$1"
HOST="$2"
cd "$DIR"
chmod +x scripts/server-setup.sh scripts/prod-start.sh

if ! command -v node >/dev/null 2>&1 || ! command -v nginx >/dev/null 2>&1 || ! command -v pm2 >/dev/null 2>&1; then
  APP_DIR="$DIR" bash scripts/server-setup.sh
else
  sudo cp scripts/nginx-beiyexing.conf /etc/nginx/sites-available/beiyexing
  sudo ln -sfn /etc/nginx/sites-available/beiyexing /etc/nginx/sites-enabled/beiyexing
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl reload nginx
fi

if [ ! -f .env ]; then
  JWT="$(openssl rand -hex 32)"
  cat > .env <<ENV
PORT=3780
NODE_ENV=production
JWT_SECRET=$JWT
WX_PAY_MOCK=1
WX_PAY_NOTIFY=http://$HOST/api/pay/wechat/notify
WEATHER_LIVE=1
ENV
  chmod 600 .env
  echo "已生成 $DIR/.env"
fi
if ! grep -q '^WEATHER_LIVE=' .env; then
  echo 'WEATHER_LIVE=1' >> .env
fi

npm install --omit=dev
npm install --prefix server --omit=dev
npm install --prefix web
npm run build --prefix web

if [ ! -f server/data/app.sqlite ]; then
  npm run seed
fi

pm2 delete beiyexing >/dev/null 2>&1 || true
pm2 start scripts/prod-start.sh --name beiyexing --interpreter bash --cwd "$DIR"
pm2 save
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null || true
curl -fsS -o /dev/null -w "local_api:%{http_code}\n" http://127.0.0.1:3780/api/routes
echo "deploy ok: http://$HOST/m  http://$HOST/admin"
REMOTE
