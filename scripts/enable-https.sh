#!/usr/bin/env bash
# 在服务器上执行一次：给 togetherbetter.cn 申请 Let's Encrypt，并切换 Nginx。
# 用法：bash scripts/enable-https.sh
# 证书放在 /etc/letsencrypt，续期走 certbot.timer。不要把私钥提交进仓库。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="togetherbetter.cn"
WEBROOT="/var/www/letsencrypt"
LIVE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

export DEBIAN_FRONTEND=noninteractive
if ! command -v certbot >/dev/null 2>&1; then
  $SUDO apt-get update
  $SUDO apt-get install -y certbot
fi

$SUDO mkdir -p "$WEBROOT/.well-known/acme-challenge"
$SUDO chown -R www-data:www-data "$WEBROOT" || $SUDO chown -R nginx:nginx "$WEBROOT" || true

# 申请阶段先保证 80 能吐出校验文件，站点仍可访问。
$SUDO cp "$ROOT/scripts/nginx-beiyexing.conf" /etc/nginx/sites-available/beiyexing
$SUDO ln -sfn /etc/nginx/sites-available/beiyexing /etc/nginx/sites-enabled/beiyexing
$SUDO nginx -t
$SUDO systemctl reload nginx

if [ ! -f "$LIVE" ]; then
  $SUDO certbot certonly --webroot -w "$WEBROOT" \
    -d "$DOMAIN" -d "www.${DOMAIN}" \
    --agree-tos --register-unsafely-without-email --non-interactive --keep-until-expiring
fi

$SUDO mkdir -p /etc/letsencrypt/renewal-hooks/deploy
$SUDO tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null <<'HOOK'
#!/bin/sh
systemctl reload nginx
HOOK
$SUDO chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx

$SUDO cp "$ROOT/scripts/nginx-beiyexing-https.conf" /etc/nginx/sites-available/beiyexing
$SUDO nginx -t
$SUDO systemctl reload nginx

ENV_FILE="$ROOT/.env"
if [ -f "$ENV_FILE" ] && grep -qE '^WX_PAY_NOTIFY=http://(togetherbetter\.cn|www\.togetherbetter\.cn|140\.143\.171\.77|192\.144\.167\.212)(/|$)' "$ENV_FILE"; then
  sed -i 's|^WX_PAY_NOTIFY=.*|WX_PAY_NOTIFY=https://togetherbetter.cn/api/pay/wechat/notify|' "$ENV_FILE"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart beiyexing --update-env >/dev/null
  fi
  echo "已把支付回调改到 https://togetherbetter.cn/api/pay/wechat/notify"
fi

echo | openssl s_client -connect 127.0.0.1:443 -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -subject -dates
ok=0
for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null -w "local_https:%{http_code}\n" --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/meta"; then
    ok=1
    break
  fi
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  echo "Nginx 已听 443，但本机 https 请求没有成功"
  exit 1
fi
echo "https ok: https://${DOMAIN}/m"
