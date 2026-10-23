#!/bin/sh
# TOCKINAX auto-deploy - runs ON THE LIVE SERVER (aaPanel 2-minute cron).
#
# Idempotent and fail-closed:
#   - no new commit              -> health check only, no rebuild
#   - CI for the new SHA not green -> do nothing, try again next tick
#   - any step fails             -> abort before the next step
#   - health check fails         -> roll back to the previous commit and rebuild
#
# Secrets live ONLY in $APP_DIR/.env on the server. Never in this file.
# The repository is public, so the GitHub API read needs no credential.
#
# Design notes:
#   - Deploys origin/main HEAD whatever branch was pushed, so a feature-branch
#     push triggers a harmless no-op rather than a wrong deploy.
#   - Migrations are additive-only and run before the build.
#   - The database is NOT rolled back (migrations are forward-only by design).
#   - The frontend build bakes NEXT_PUBLIC_API_URL, so it MUST be exported here.

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
LOG="/var/log/tockinax-deploy.log"
LOCK="/var/lock/tockinax-deploy.lock"
# ---------------------------------------------------------------------------

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" >> "$LOG"; }

# One deploy at a time. A 2-minute tick must never overlap a slow build.
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] previous deploy still running - skipping" >> "$LOG"
  exit 0
fi

cd "$APP_DIR"

git fetch --quiet origin "$BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  # Nothing new. Still prove the app is alive; restart if it is not.
  if curl -sf -o /dev/null --max-time 10 "$API_HEALTH" && curl -sf -o /dev/null --max-time 10 "$WEB_HEALTH"; then
    exit 0
  fi
  log "no new commit, but health check failed - restarting"
  pm2 restart "$API_NAME" "$WEB_NAME" >/dev/null 2>&1 || true
  exit 0
fi

# ---- CI gate: only ship a commit whose pipeline is green -------------------
STATUS_JSON="$(curl -sf --max-time 20 \
  "https://api.github.com/repos/${REPO}/actions/workflows/ci.yml/runs?head_sha=${REMOTE}&per_page=1" \
  || echo '')"

if [ -z "$STATUS_JSON" ]; then
  log "CI status unavailable for ${REMOTE} - refusing to deploy (fail closed)"
  exit 0
fi

CONCLUSION="$(printf '%s' "$STATUS_JSON" | python3 -c 'import sys,json;d=json.load(sys.stdin);r=d.get("workflow_runs") or [];print(r[0]["conclusion"] if r else "none")' 2>/dev/null || echo none)"

if [ "$CONCLUSION" != "success" ]; then
  log "CI for ${REMOTE} is '${CONCLUSION}' - not deploying"
  exit 0
fi

log "deploying ${REMOTE} (was ${LOCAL})"

# ---- deploy ---------------------------------------------------------------
PREV="$LOCAL"

rollback() {
  log "ROLLBACK to ${PREV}"
  git reset --hard "$PREV" >/dev/null 2>&1 || true
  npm ci >/dev/null 2>&1 || true
  NEXT_PUBLIC_API_URL="$PUBLIC_API_URL" npm run build >/dev/null 2>&1 || true
  pm2 restart "$API_NAME" "$WEB_NAME" >/dev/null 2>&1 || true
  log "rollback finished"
  exit 1
}

git reset --hard "$REMOTE" || rollback

log "installing dependencies"
npm ci || rollback

log "running migrations"
npm run db:migrate:all --workspace=backend || rollback

log "building frontend"
NEXT_PUBLIC_API_URL="$PUBLIC_API_URL" npm run build || rollback

log "reloading processes"
pm2 reload "$API_NAME" "$WEB_NAME" >/dev/null 2>&1 || pm2 restart "$API_NAME" "$WEB_NAME" || rollback

sleep 5

if ! curl -sf -o /dev/null --max-time 15 "$API_HEALTH"; then
  log "api health check FAILED"
  rollback
fi
if ! curl -sf -o /dev/null --max-time 15 "$WEB_HEALTH"; then
  log "web health check FAILED"
  rollback
fi

log "deployed ${REMOTE} OK"
