# TOCKINAX backend — production image (npm workspaces: single root lockfile).
# Build from repo root: docker build -f backend/Dockerfile .
FROM node:20-alpine AS base
WORKDIR /app

# Workspace manifests first (root lock covers backend+frontend)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace=backend --omit=dev || npm install --workspace=backend --omit=dev

COPY backend/src ./backend/src
COPY backend/db ./backend/db
COPY backend/drizzle.config.js ./backend/drizzle.config.js

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=5070
EXPOSE 5070

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5070/healthz | grep -q '"ok":true' || exit 1

CMD ["node", "src/server.js"]
