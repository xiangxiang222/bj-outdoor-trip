#!/usr/bin/env bash
# 在本机项目根目录执行：把代码同步到腾讯云轻量服务器并启动。
# 用法：./scripts/deploy.sh
# 可选环境变量：DEPLOY_HOST DEPLOY_USER DEPLOY_DIR DEPLOY_SSH_KEY PUBLIC_URL
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_HOST="140.143.171.77"
RETIRED_HOST="192.144.167.212"
HOST="${DEPLOY_HOST:-$DEFAULT_HOST}"
# Actions 的 deploy.yml 仍可能 export 已下线 IP（改 workflow 需要额外授权）。
if [ "$HOST" = "$RETIRED_HOST" ]; then
  echo "==> 忽略已下线主机 $RETIRED_HOST，改连 $DEFAULT_HOST"
  HOST="$DEFAULT_HOST"
fi
PUBLIC_URL="${PUBLIC_URL:-https://togetherbetter.cn}"
USER="${DEPLOY_USER:-ubuntu}"
DIR="${DEPLOY_DIR:-/var/www/beiyexing}"
KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
ssh-keyscan -H "$HOST" >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 "$USER@$HOST")
RSYNC_SSH="ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o ServerAliveInterval=15"

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

echo "==> 准备目录 $USER@$HOST:$DIR"
"${SSH[@]}" "sudo mkdir -p '$DIR' && sudo chown '$USER:$USER' '$DIR'"
echo "==> rsync 开始 $(date -u +%H:%M:%S) UTC"
# 整目录排除 data：新机若已拷库，--delete 删不掉非空目录会让 rsync 失败并卡住。
# 不用 chown -R：新机若已有 node_modules / 照片，递归改属主可以闷头跑十几分钟。
rsync -azh --delete --partial --timeout=120 --stats -e "$RSYNC_SSH" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'web/node_modules/' \
  --exclude 'server/node_modules/' \
  --exclude 'web/dist/' \
  --exclude 'coverage/' \
  --exclude 'server/coverage/' \
  --exclude 'server/data/' \
  --exclude 'server/public/static/uploads/' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.DS_Store' \
  "$ROOT/" "$USER@$HOST:$DIR/"
echo "==> rsync 结束 $(date -u +%H:%M:%S) UTC"

echo "==> 远程安装依赖并启动"
"${SSH[@]}" bash -s -- "$DIR" "$HOST" "$PUBLIC_URL" <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
DIR="$1"
HOST="$2"
PUBLIC_URL="$3"
cd "$DIR"
chmod +x scripts/server-setup.sh scripts/prod-start.sh
mkdir -p server/data server/public/static/uploads

if ! command -v node >/dev/null 2>&1 || ! command -v nginx >/dev/null 2>&1 || ! command -v pm2 >/dev/null 2>&1; then
  APP_DIR="$DIR" bash scripts/server-setup.sh
else
  NGINX_CONF="scripts/nginx-beiyexing.conf"
  if [ -f /etc/letsencrypt/live/togetherbetter.cn/fullchain.pem ]; then
    NGINX_CONF="scripts/nginx-beiyexing-https.conf"
  fi
  sudo cp "$NGINX_CONF" /etc/nginx/sites-available/beiyexing
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
WX_PAY_NOTIFY=$PUBLIC_URL/api/pay/wechat/notify
WEATHER_LIVE=1
ENV
  chmod 600 .env
  echo "已生成 $DIR/.env"
fi
if ! grep -q '^WEATHER_LIVE=' .env; then
  echo 'WEATHER_LIVE=1' >> .env
fi
if grep -qE '^WX_PAY_NOTIFY=http://(192\.144\.167\.212|140\.143\.171\.77|togetherbetter\.cn|www\.togetherbetter\.cn)(/|$)' .env; then
  sed -i -E 's|^WX_PAY_NOTIFY=.*|WX_PAY_NOTIFY='"$PUBLIC_URL"'/api/pay/wechat/notify|' .env
  echo "已把 WX_PAY_NOTIFY 改到 $PUBLIC_URL"
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
ok=0
for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null -w "local_api:%{http_code}\n" http://127.0.0.1:3780/api/routes; then
    ok=1
    break
  fi
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  echo "==> API 未响应，PM2 状态与最近日志"
  pm2 describe beiyexing || true
  pm2 logs beiyexing --err --lines 120 --nostream || true
  exit 1
fi
echo "deploy ok: $PUBLIC_URL/m  $PUBLIC_URL/admin"
REMOTE
