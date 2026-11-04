# TOCKINAX frontend - production image (npm workspaces: single root lockfile).
# Build from repo root: docker build -f frontend/Dockerfile .
#
# Notes:
# - Dependencies are HOISTED to /app/node_modules by npm workspaces, so the
#   runtime stage copies the root node_modules, not a nested frontend one.
# - There is no next.config.* in this project; never COPY a glob that may not
#   match - a zero-match COPY is a hard build failure.
FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace=frontend

FROM node:25-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY frontend ./frontend
WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:25-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/frontend ./frontend
WORKDIR /app/frontend
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/ >/dev/null || exit 1
CMD ["npm", "run", "start"]
