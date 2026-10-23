#!/bin/sh
# TOCKINAX auto-deploy - runs ON THE LIVE SERVER (aaPanel 2-minute cron).
#
# Idempotent and fail-closed:
#   - no new commit                -> health check only, no rebuild
#   - CI for the new SHA not green -> do nothing, try again next tick
#   - this exact SHA already failed -> do nothing until a NEW commit arrives
#   - any step fails               -> abort, record the SHA, roll back, rebuild
#   - health check fails           -> same rollback
#
# Every step writes its full output to $LOG. A failure with no diagnostic is a
# failure that cannot be fixed, so nothing is sent to /dev/null.
#
# Secrets live ONLY in $APP_DIR/.env on the server. Never in this file.
# The repository is public, so the GitHub API read needs no credential.

set -eu

# ---- configure -------------------------------------------------------------
APP_DIR="/www/wwwroot/tockinax"
BRANCH="main"
REPO="Ebankz007/tockinax"
API_PORT="4002"
WEB_PORT="3201"
API_NAME="tockinax-api"
WEB_NAME="tockinax-web"
API_HEALTH="http://127.0.0.1:${API_PORT}/healthz"
WEB_HEALTH="http://127.0.0.1:${WEB_PORT}/"
PUBLIC_API_URL="https://tockinax.com/api/v1"
BUILD_MEM="--max-old-space-size=2048"
LOG="/var/log/tockinax-deploy.log"
LOCK="/var/lock/tockinax-deploy.lock"
FAILMARK="/var/lib/tockinax-deploy/failed-sha"
# ---------------------------------------------------------------------------

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" >> "$LOG"; }

run() {
  desc="$1"; shift
  log "-> $desc"
  if "$@" >> "$LOG" 2>&1; then
    log "   ok: $desc"
    return 0
  fi
  log "   FAILED: $desc (see lines above)"
  return 1
}

healthy() {
  curl -sf -o /dev/null --max-time 15 "$API_HEALTH" &&
  curl -sf -o /dev/null --max-time 15 "$WEB_HEALTH"
}

mkdir -p "$(dirname "$FAILMARK")"

# One deploy at a time - a 2-minute tick must never overlap a slow build.
exec 9>"$LOCK"
if ! flock -n 9; then
  log "previous deploy still running - skipping"
  exit 0
fi

cd "$APP_DIR"

git fetch --quiet origin "$BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

# ---- nothing new -----------------------------------------------------------
if [ "$LOCAL" = "$REMOTE" ]; then
  if healthy; then
    exit 0
  fi
  log "no new commit but health check failed - restarting processes"
  pm2 restart "$API_NAME" "$WEB_NAME" >/dev/null 2>&1 || true
  exit 0
fi

# ---- do not retry a commit that already failed -----------------------------
if [ -f "$FAILMARK" ] && [ "$(cat "$FAILMARK")" = "$REMOTE" ]; then
  exit 0
fi

# ---- CI gate ---------------------------------------------------------------
STATUS_JSON="$(curl -sf --max-time 20 \
  "https://api.github.com/repos/${REPO}/actions/workflows/ci.yml/runs?head_sha=${REMOTE}&per_page=1" \
  || echo '')"

if [ -z "$STATUS_JSON" ]; then
  log "CI status unavailable for ${REMOTE} - refusing to deploy (fail closed)"
  exit 0
fi

CONCLUSION="$(printf '%s' "$STATUS_JSON" | python3 -c 'import sys,json;d=json.load(sys.stdin);r=d.get("workflow_runs") or [];print(r[0]["conclusion"] if r else "none")' 2>/dev/null || echo none)"

if [ "$CONCLUSION" != "success" ]; then
  log "CI for ${REMOTE} is '${CONCLUSION}' - not deploying yet"
  exit 0
fi

# ---- deploy ----------------------------------------------------------------
PREV="$LOCAL"
log "deploying ${REMOTE} (was ${PREV})"

rollback() {
  log "ROLLBACK to ${PREV}"
  echo "$REMOTE" > "$FAILMARK"
  git reset --hard "$PREV" >> "$LOG" 2>&1 || true
  run "rollback: npm ci" npm ci || true
  run "rollback: build" env NEXT_PUBLIC_API_URL="$PUBLIC_API_URL" NODE_OPTIONS="$BUILD_MEM" npm run build || true
  pm2 restart "$API_NAME" "$WEB_NAME" >> "$LOG" 2>&1 || true
  log "rollback finished - site serving ${PREV}"
  exit 1
}

LOCK_BEFORE="$(git show "${PREV}:package-lock.json" 2>/dev/null | sha256sum | cut -d' ' -f1)"

git reset --hard "$REMOTE" >> "$LOG" 2>&1 || rollback

LOCK_AFTER="$(sha256sum package-lock.json 2>/dev/null | cut -d' ' -f1)"
if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  run "npm ci (lockfile changed)" npm ci || rollback
else
  log "dependencies unchanged - skipping npm ci"
fi

run "migrations" npm run db:migrate:all --workspace=backend || rollback

run "build frontend" env NEXT_PUBLIC_API_URL="$PUBLIC_API_URL" NODE_OPTIONS="$BUILD_MEM" npm run build || rollback

log "reloading processes"
pm2 reload "$API_NAME" "$WEB_NAME" >> "$LOG" 2>&1 || pm2 restart "$API_NAME" "$WEB_NAME" >> "$LOG" 2>&1 || rollback

sleep 6

if ! curl -sf -o /dev/null --max-time 15 "$API_HEALTH"; then
  log "api health check FAILED"
  rollback
fi
if ! curl -sf -o /dev/null --max-time 15 "$WEB_HEALTH"; then
  log "web health check FAILED"
  rollback
fi

rm -f "$FAILMARK"
log "deployed ${REMOTE} OK"
