#!/usr/bin/env bash
# Deploy no servidor (magalu): build da imagem, canary com healthcheck e swap.
# Uso: bash scripts/deploy.sh <sha>
set -euo pipefail

APP_DIR=/home/ubuntu/checklist
ENV_FILE="$APP_DIR/.deploy-env"
cd "$APP_DIR"

SHA="${1:-manual-$(date +%s)}"
IMG="checklist:${SHA}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERRO: $ENV_FILE ausente (segredos de produção)." >&2
  exit 1
fi

echo "=== build ${IMG} ==="
docker build --pull -t "$IMG" -t checklist:latest .

echo "=== canary em 127.0.0.1:3031 (bot desligado p/ não conflitar polling) ==="
docker rm -f checklist-canary 2>/dev/null || true
docker run -d --name checklist-canary \
  --network host \
  --env-file "$ENV_FILE" \
  -e PORT=3031 \
  -e BOT_MODE=disabled \
  "$IMG"

ok=0
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3031/api/health >/dev/null 2>&1; then
    ok=1
    echo "canary OK em ${i}s"
    break
  fi
  sleep 1
done
if [ "$ok" -eq 0 ]; then
  echo "ERRO: canary não passou no healthcheck" >&2
  docker logs --tail 80 checklist-canary || true
  docker rm -f checklist-canary || true
  exit 1
fi
docker rm -f checklist-canary

echo "=== swap producao (127.0.0.1:3030) ==="
PREV=$(docker inspect checklist --format '{{.Config.Image}}' 2>/dev/null || echo "")
if [ -n "$PREV" ] && [ "$PREV" != "$IMG" ]; then
  docker tag "$PREV" checklist:previous || true
fi
docker rm -f checklist 2>/dev/null || true
docker run -d --name checklist \
  --restart unless-stopped \
  --network host \
  --env-file "$ENV_FILE" \
  "$IMG"

ok=0
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3030/api/health >/dev/null 2>&1; then
    ok=1
    echo "producao OK em ${i}s"
    break
  fi
  sleep 1
done
if [ "$ok" -eq 0 ]; then
  echo "ERRO: produção não saudável — tentando rollback" >&2
  docker logs --tail 80 checklist || true
  if docker image inspect checklist:previous >/dev/null 2>&1; then
    docker rm -f checklist || true
    docker run -d --name checklist --restart unless-stopped --network host \
      --env-file "$ENV_FILE" checklist:previous
    echo "rollback para checklist:previous executado"
  fi
  exit 1
fi

docker image prune -f >/dev/null 2>&1 || true
echo "=== OK: checklist ${SHA} no ar ==="
