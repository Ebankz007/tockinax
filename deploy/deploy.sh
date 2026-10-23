#!/bin/sh
# TOCKINAX auto-deploy - runs ON THE LIVE SERVER (aaPanel 2-minute cron).
#
# Idempotent and fail-closed:
#   - no new commit                 -> health check only, no rebuild
#   - CI for the new SHA not green  -> do nothing, try again next tick
#   - this exact SHA already failed -> do nothing until a NEW commit arrives
#   - any step fails                -> abort, record the SHA, restore, restart
#   - health check fails            -> same
#   - restarted process is not new  -> same
#   - served page is not this build -> same
#
# Two lessons are baked in here:
#   * A restart that is not verified is not a restart. `pm2 reload a b` silently
#     skipped one app; the process kept serving a stale build while every check
#     passed. So each app is restarted individually and its PID is compared.
#   * A 200 is not a deployment. The page must contain the SHA we just built,
#     otherwise the old build is still being served.
#
# Rollback restores the previous `.next` snapshot instead of rebuilding it. A
# rebuild is the step most likely to fail, and a rollback that can itself fail
# is not a rollback.
#
# Everything is appended to $LOG, including shell aborts before the first step:
# a failure with no diagnostic is a failure that cannot be fixed.
#
# Secrets live ONLY in $APP_DIR/.env on the server. Never in this file.

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

# From here on, every line of output - ours, npm's, and the shell's own error
# messages - lands in the log.
exec >> "$LOG" 2>&1

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

trap 'rc=$?; if [ "$rc" -ne 0 ]; then log "script exited rc=$rc"; fi' EXIT

run() {
  desc="$1"; shift
  log "-> $desc"
  if "$@"; then
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

pm2_pid() { pm2 pid "$1" 2>/dev/null | tr -d '[:space:]'; }

# Restart one app and prove it actually came back as a NEW process.
restart_one() {
  name="$1"
  before="$(pm2_pid "$name")"
  if ! pm2 restart "$name"; then
    log "   pm2 restart $name failed"
    return 1
  fi
  i=0
  while [ "$i" -lt 25 ]; do
    after="$(pm2_pid "$name")"
    if [ -n "$after" ] && [ "$after" != "0" ] && [ "$after" != "$before" ]; then
      log "   $name restarted (pid ${before:-?} -> $after)"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  log "   $name did NOT restart (pid still ${before:-?}) - treating as failure"
  return 1
}

build_frontend() {
  sha="$(git rev-parse --short HEAD)"
  before="$(cat frontend/.next/BUILD_ID 2>/dev/null || echo none)"
  if ! run "build frontend (${sha})" env \
      NEXT_PUBLIC_API_URL="$PUBLIC_API_URL" \
      NEXT_PUBLIC_BUILD_SHA="$sha" \
      NODE_OPTIONS="$BUILD_MEM" \
      npm run build --workspace=frontend; then
    return 1
  fi
  after="$(cat frontend/.next/BUILD_ID 2>/dev/null || echo none)"
  if [ "$after" = "none" ]; then
    log "   build reported success but produced no BUILD_ID - treating as failure"
    return 1
  fi
  if [ "$after" = "$before" ]; then
    log "   BUILD_ID did not change (${after}) - next build did not replace its output"
    return 1
  fi
  log "   BUILD_ID ${before} -> ${after}"
  return 0
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
  if ! healthy; then
    log "no new commit but health check failed - restarting processes"
    pm2 restart "$API_NAME" || true
    pm2 restart "$WEB_NAME" || true
    exit 0
  fi
  # A 200 does not prove the right build is being served. If the running process
  # predates the current build it will happily keep answering with old HTML.
  SHA_NOW="$(git rev-parse --short HEAD)"
  if ! curl -sf --max-time 15 "$WEB_HEALTH" | grep -q "$SHA_NOW"; then
    log "serving a build without marker ${SHA_NOW} - restarting ${WEB_NAME}"
    restart_one "$WEB_NAME" || true
  fi
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

restore_next() {
  if [ -d frontend/.next.prev ]; then
    rm -rf frontend/.next
    mv frontend/.next.prev frontend/.next
    log "restored previous .next snapshot"
    return 0
  fi
  log "no .next snapshot available to restore"
  return 1
}

rollback() {
  log "ROLLBACK to ${PREV}"
  echo "$REMOTE" > "$FAILMARK"
  git reset --hard "$PREV" || true
  if ! restore_next; then
    log "rebuilding previous commit as a last resort"
    npm ci || true
    env NEXT_PUBLIC_API_URL="$PUBLIC_API_URL" NODE_OPTIONS="$BUILD_MEM" \
      npm run build --workspace=frontend || true
  fi
  pm2 restart "$API_NAME" || true
  pm2 restart "$WEB_NAME" || true
  log "rollback finished - site serving ${PREV}"
  exit 1
}

# Snapshot the working build before touching anything.
rm -rf frontend/.next.prev
if [ -d frontend/.next ]; then
  if cp -a frontend/.next frontend/.next.prev; then
    log "snapshot: saved current .next"
  else
    log "snapshot: FAILED to copy .next - rollback would have to rebuild"
  fi
fi

LOCK_BEFORE="$(git show "${PREV}:package-lock.json" 2>/dev/null | sha256sum | cut -d' ' -f1)"

git reset --hard "$REMOTE" || rollback

LOCK_AFTER="$(sha256sum package-lock.json 2>/dev/null | cut -d' ' -f1)"
if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  run "npm ci (lockfile changed)" npm ci || rollback
else
  log "dependencies unchanged - skipping npm ci"
fi

run "migrations" npm run db:migrate:all --workspace=backend || rollback

build_frontend || rollback

SHORT_SHA="$(git rev-parse --short HEAD)"

log "restarting processes"
restart_one "$API_NAME" || rollback
restart_one "$WEB_NAME" || rollback

sleep 4

if ! curl -sf -o /dev/null --max-time 15 "$API_HEALTH"; then
  log "api health check FAILED"
  rollback
fi
if ! curl -sf -o /dev/null --max-time 15 "$WEB_HEALTH"; then
  log "web health check FAILED"
  rollback
fi

# A 200 is not a deployment: prove the served page is the build we just made.
if ! curl -sf --max-time 15 "$WEB_HEALTH" | grep -q "$SHORT_SHA"; then
  log "served page does not contain build marker ${SHORT_SHA} - stale build"
  rollback
fi
log "served page carries build marker ${SHORT_SHA}"

rm -rf frontend/.next.prev
rm -f "$FAILMARK"
log "deployed ${REMOTE} OK"
