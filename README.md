# TOCKINAX

Gated P2P community marketplace + referral + rewards (modular monolith). Secure defaults: live payments OFF, rewards OFF, crypto OFF until approvals.

## Quickstart (local)

```powershell
cp .env.example .env
# edit DATABASE_URL / JWT secrets (openssl rand -base64 64)
docker compose up -d db redis
cd backend; npm install; npm run db:migrate; npm run db:seed; npm run dev
# api → http://localhost:5070/healthz
cd ../frontend; npm install; npm run dev
# site → http://localhost:3001
```

## Repo map
- `ARCHITECTURE.md` — decisions + invariants
- `IMPLEMENTATION_PLAN.md` — phased plan
- `backend/` — Express + Drizzle + pg API (`/api/v1/...`)
- `frontend/` — Next.js shell (full pages Phases 3-5)
- `STATUS.md` — live readiness tracker
- `docs/COMPLIANCE_CHECKLIST.md` — must-complete before live money

## Safety rules
- Screenshot ≠ proof. Orders complete only on signed webhook or admin review.
- No recruitment commissions. Basis = `eligible_verified_sales` only.
- Stage A (3%) / Stage B (7%) are DRAFT + unfunded. Not returns on deposits.
- Never store private keys / seeds. Crypto routes return 403 while disabled.

## Hardening middleware (`backend/src/middleware/`)

- `validate.js` — Zod wrapper: `router.post('/x', validate({ body: s }), handler)` → 400 `validation_error`.
- `idempotency.js` — reads `Idempotency-Key` → `req.idempotencyKey` (`{ required: true }` → 400 `idempotency_key_required`).
- `upload.js` — multer-free evidence guard (5 MB cap, png/jpg/pdf magic bytes). Wiring (Phase 3):

```js
const { evidenceUpload } = require('../middleware/upload');
router.post('/orders/:id/evidence',
  express.raw({ type: '*/*', limit: '5mb' }),
  evidenceUpload({ required: false }),
  handler);
```

