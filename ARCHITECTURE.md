# TOCKINAX — Architecture Document v1.0

**Project:** TOCKINAX — Gated P2P Community Marketplace + Referral + Rewards
**Company:** MMITPS INC (configurable via `system_settings`)
**Domain:** TBD (configurable, defaults to `localhost`)
**Date:** 2026-10-13
**Author:** Kairos (Senior Architect / PM / Security)

## 1. Inspection Summary (Phase 1 findings)

### Root workspace `C:\BerfamWorks\MMITPS INC`
- `production/` — Legacy MERN stack (Express + **MongoDB/Mongoose** + Next.js + Python AI services). 200+ backend files, MLM TreeNode/Commission, Wallet/Transaction, KYC, subscriptions. Mongo-based → **unsuitable as ledger foundation** (no double-entry, no SERIALIZABLE guarantees). Reuse patterns only (RBAC middleware, rate-limit, Paystack/Flutterwave webhook verification ideas), not data layer.
- `mmitps/` — Current stack: **Express 4 + Drizzle ORM + PostgreSQL + Redis + Next.js**, JWT (access+refresh), Paystack/Flutterwave/Korapay keys, ENCRYPTION_KEY for PII. This is the team's proven operational pattern.
- `AmplifiedTraders/` — docs-only. No code to reuse.
- `tockinax/` — greenfield (empty at inspection).

### Runtime
- Node v24.12.0, npm 11.6.2, Docker 29.6.2 ✅
- `psql`, `redis-cli` not on PATH ❌ → provision via Docker Compose (postgres:16, redis:7).
- No existing tockinax credentials, no payment provider live keys → all provider integrations start **disabled**, interface-only.

### Decision: Stack divergence (documented alternative per §13)
MASTER prompt recommends NestJS + Prisma/TypeORM. Team operates Express + Drizzle + pg.
To avoid rebuilding working auth/ORM muscle and to ship a maintainable modular monolith fast, tockinax uses:
- **Backend:** Node 20+ / Express 4 + Zod validation + Drizzle ORM + `pg`
- **Frontend:** Next.js 14 + TypeScript + Tailwind (scaffolded Phase 2+)
- **DB:** PostgreSQL 16 (double-entry ledger, advisory locks, exclusion constraints)
- **Queue/Cache:** Redis 7 + BullMQ (payout jobs, commission rollup, expiry sweeps)
- **Auth:** httpOnly signed session cookies + rotating refresh, MFA (TOTP) for admin/finance
- **Storage:** Private object storage interface (local disk in dev, S3-compatible in prod)
- **Tests:** Vitest/Jest (unit+integration) + Supertest (API) + Playwright (E2E, Phase 6)

Rationale recorded; migration to NestJS remains possible because domain modules are dependency-injected services with versioned `/api/v1` boundaries.

## 2. Domain Boundaries (modular monolith)

```
tockinax/
  backend/src/
    modules/
      auth/        # registration, email verify, login, MFA, sessions, consent
      users/       # profiles, identity_checks, roles/permissions (RBAC)
      catalog/     # listings, listing_images, categories
      orders/      # orders, order_items, payment_evidence, provider_events, disputes
      referrals/   # referrals, referral_closure, commission_rules, commission_calculations
      rewards/     # reward_campaigns, campaign_eligibility, reward_calculations
      ledger/      # ledger_accounts, ledger_transactions, ledger_entries (immutable)
      payouts/     # payout_requests, payout_events, refunds, reconciliation_runs
      support/     # support_tickets, support_messages
      content/     # content_pages, announcements, FAQs, banners
      platform/    # system_settings, feature_flags, notifications, audit_logs, fraud_risk_events
    middleware/    # auth, rbac, validate, rateLimit, idempotency, upload
    lib/           # db, redis, queue, mailer, storage, fx-rates, money (Decimal.js)
    routes/v1/     # versioned API surface
  frontend/        # Next.js (public site + member + admin) — Phase 2+
  db/              # drizzle schema + migrations + seeds
  docker/          # Dockerfiles
```

No cross-module direct table writes. All money movement goes through `ledger.postBalanced()` inside a DB transaction with idempotency key.

## 3. Core Invariants (non-negotiable)

1. **No fake escrow.** Direct member-to-member payments are recorded as `order + evidence`, never as custodial balance. Copy: "recorded, not held."
2. **No recruitment commissions.** Commissions calculate ONLY from `eligible_verified_sales` with an approved `commission_rules` version, confirmed period elapsed, refund window passed, budget remaining.
3. **Rewards disabled by default.** `reward_campaigns.status=DRAFT`, `payouts_enabled=false`. The proposed 3%/5-day, 7%/3-day rates ship as `DISABLED` seed rows with `funding_source=NULL` → payout API returns 409 until admin configures budget + funding + legal approval.
4. **USDT/crypto disabled until approved.** `feature_flags.crypto_payouts=false`, `crypto_deposits=false`. No private-key storage ever.
5. **Screenshot ≠ proof.** `payment_evidence` → `PENDING_REVIEW`. Order transitions to PAID only on signed webhook or finance dual-approval.
6. **Ledger immutability.** `ledger_entries` append-only (REVOKE UPDATE/DELETE from app role). Corrections via reversal entries linking `reverses_id`.
7. **RBAC server-side.** Six roles: visitor, member, seller (flag), support, finance, super_admin. Granular permissions checked in middleware + service, never frontend-only.
8. **Idempotency everywhere.** Webhooks, ledger posts, commission runs, payout requests all carry `Idempotency-Key` + unique constraints.

## 4. Data Design (PostgreSQL, Drizzle)

> Naming legacy (2026-10-15 rebrand gatedp2p → TOCKINAX): the Postgres **schema stays
> `gatedp2p`** (`SET search_path TO gatedp2p, public`, `CREATE SCHEMA IF NOT EXISTS
> gatedp2p`, `gatedp2p_app` role) because the live dev database already holds data under
> it. Renaming a schema buys zero user value at the cost of a migration + downtime.
> Everything user-visible (package names, containers, cookies, order prefix `TKX-`,
> platform display name) is TOCKINAX. New prod databases may be named `tockinax_prod`
> but keep the same schema name until a major migration says otherwise.

28 tables per §12 (users → fraud_risk_events). Key patterns:
- `users(id uuid, email citext unique, password_hash, status, referral_code unique, referred_by, terms_version, ...)`
- `referral_closure(ancestor, descendant, depth)` maintained by trigger/service, CHECK(depth<=5), cycle-prevention via `NOT EXISTS` + exclusion on self-reference.
- `commission_rules(id, version, level, rate_bps, basis, eligibility_json, effective_from/to, budget_cap, confirmation_days, active)` — immutable versions; calculations pin `rule_version`.
- `reward_campaigns(..., reward_rate_bps, budget_cap, funding_source, status, approved_by, approved_at)` + `reward_calculations(..., rule_version, source_order_id unique per campaign+rule, status, reversed_by)`.
- `ledger_accounts(code unique, type: ASSET|LIABILITY|REVENUE|EXPENSE|MEMBER_LIABILITY, currency)` + `ledger_transactions(id, source_type, source_id, currency, idempotency_key unique, posted_at)` + `ledger_entries(id, tx_id, account, debit, credit numeric(19,4), CHECK(debit*credit=0))`. Balance check enforced in service + DB constraint `SUM(debit-credit)=0 per tx`.
- Money as `numeric(19,4)` + `char(3)` ISO currency. App uses Decimal.js, never float.
- Audit: `audit_logs(actor, action, target_type, target_id, diff_json, ip, created_at)` written on every admin/finance mutation. `fraud_risk_events` from detectors (self-referral, duplicate device, wash-trade velocity).

Migrations via `drizzle-kit generate/migrate`. Seeds are idempotent and never contain secrets.

## 5. Order State Machine

`DRAFT → PENDING_PAYMENT → EVIDENCE_SUBMITTED → UNDER_REVIEW → COMPLETED | DISPUTED → (RESOLVED_COMPLETED | CANCELLED) ; PENDING_PAYMENT → EXPIRED (sweeper); any → CANCELLED (buyer/seller/admin per policy)`

Guards: amounts re-priced server-side from listing; currency validated against `system_settings.allowed_currencies` (default: USD, NGN, USDT-disabled); expiry job via BullMQ; dispute SLA timers create `fraud_risk_events` on breach.

## 6. NGN / FX Handling
- Display-only converter: `fx_rates(base, quote, rate, source, fetched_at)` refreshed by job (default source: configurable; no hardcoded parallel-market scraping in MVP).
- Checkout shows: amount + currency + converted NGN estimate + "indicative, not final; provider settles" + any conversion fee line. Fees explicit.

## 7. Security Posture
bcrypt (12) + pepper, email verify (signed 24h token), reset (single-use, hashed), TOTP MFA for staff, secure cookies (`HttpOnly; Secure; SameSite=Lax`), Helmet CSP, rate-limit (auth 5/min, api 120/min, webhook 60/min), Zod input validation + output allow-listing, private uploads (signed URLs, mime+magic check, AV hook point), webhook HMAC verify + timestamp tolerance + replay cache, least-privilege DB roles (`app_rw` vs `migrate_owner`), nightly `pg_dump` + restore drill doc.

## 8. Observability / Ops
`/healthz`, `/readyz`, structured JSON logs (pino), OpenTelemetry hook, admin Ops dashboard (reconciliation exceptions, queue depth, payout latency). Docker: `backend`, `frontend`, `postgres`, `redis` services; env-only secrets; CI runs migrate + test + build.

## 9. Blockers / Placeholders (no invented financial rules)
- Platform name/company/domain → `system_settings` (defaults: TOCKINAX / MMITPS INC / TBD).
- Registration/service fee amounts → `service_fees` table, default 0 (free) until admin sets + refund policy.
- Paystack/Flutterwave live keys, USDT network approval, SMS provider → disabled interfaces with `.env.example` placeholders.
- Legal sign-off gate: `feature_flags.live_payments=false` blocks real-money activation; admin checklist in `/docs/COMPLIANCE_CHECKLIST.md`.

## 10. What Reused vs Rebuilt
- Reused (patterns, not copy-paste): RBAC shape, rate-limit tiers, webhook HMAC pattern, Drizzle project layout from `mmitps/`.
- Rebuilt: ledger (never existed), referral_closure (TreeNode was Mongo-adjacent, replaced), rewards engine with budget caps + versioning, payout dual-approval, content CMS.
