# TOCKINAX frontend — production image (npm workspaces: single root lockfile).
# Build from repo root: docker build -f frontend/Dockerfile .
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace=frontend || npm install --workspace=frontend

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY package.json package-lock.json ./
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app/frontend
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=builder /app/frontend/package.json ./
COPY --from=builder /app/frontend/.next ./.next
COPY --from=builder /app/frontend/app ./app
COPY --from=builder /app/frontend/next.config.* ./
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/frontend/node_modules ./node_modules
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/ | grep -q . || exit 1
CMD ["sh", "-c", "npm run start -- -p 3001"]
