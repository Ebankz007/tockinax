# TOCKINAX — Implementation Plan (Phases 1-7)

Defaults (configurable, not hardcoded law): platform=`tockinax`, company=`MMITPS INC`, domain=`TBD`.
Stack: Express+Drizzle+Postgres+Redis+Next.js (see ARCHITECTURE.md §1 for divergence rationale).

## Phase 1 — Inspect & Plan [DONE]
- [x] Inventory `production/` (Mongo legacy), `mmitps/` (Express+Drizzle+PG — pattern source), runtime (Node 24, Docker 29, no local PG/Redis).
- [x] ARCHITECTURE.md (this plan's parent).
- [ ] IMPLEMENTATION_PLAN.md (this file) + ROADMAP tracking.

## Phase 2 — Foundation [IN PROGRESS]
1. Root: `package.json` (workspaces), `.env.example` (placeholders only), `docker-compose.yml` (pg16+redis7), `.gitignore`, `README.md`.
2. `db/schema/` (Drizzle, 28 tables) + `db/migrate/` + `db/seed.cjs` (roles, permissions, fee=0, commission L1 5%/L2 3%/L3 2% as DISABLED-until-approved versions, campaigns Stage A/B as DRAFT disabled, content pages).
3. `backend/`: Express app, `/healthz`, `/readyz`, middleware (auth JWT, rbac, validate Zod, rateLimit, idempotency, audit), modules auth/users/platform wired; shared UI tokens for frontend.
4. `frontend/`: Next.js scaffold (public pages shell + member/admin layout shells). Full pages in Phase 3-5.
5. Acceptance: `docker compose up -d db redis` → `npm run db:migrate` → `npm run dev` boots; login + RBAC denial test green.

## Phase 3 — Marketplace & Orders
- Listings CRUD + images (private storage, signed URLs) + admin approve/reject/suspend.
- Orders state machine (Draft→Pending→Evidence→Review→Completed/Cancelled/Expired/Disputed) + expiry sweeper (BullMQ) + disputes + support assignment.
- Server-side pricing, evidence≠proof guard, member-payments-are-recorded-not-held copy.
- Tests: invalid transitions rejected, amount tamper rejected, dispute open/resolve flow.

## Phase 4 — Referral & Rewards (safeguards first)
- Referral code/link, attribution immutable, closure table depth≤5, cycle/self-referral/duplicate/wash guards.
- Commission engine: versioned rules, basis=`eligible_verified_sales` ONLY, confirmation period, budget cap, idempotent per (order,rule_version), refund-triggered reversal.
- Rewards engine: campaign lifecycle Draft→Pending→Scheduled→Active→Paused→Completed/Cancelled; Stage A (3-day) & Stage B (5-day) seeds = DRAFT, rate rows present but `active=false`, payouts blocked (409) until budget+funding+approval.
- Tests: ineligible events pay 0; double-run pays once; rule change preserves history.

## Phase 5 — Ledger, Payouts, Integrations (gated)
- Double-entry ledger (`postBalanced` tx, Decimal, per-currency balance check, idempotency, append-only grants).
- Separate accounts: service-fee revenue, marketplace fees, member-transfer records (memo only), commission liability, reward liability, ops funding, payouts, refunds.
- Payout workflow Requested→Review→Approved→Processing→Paid/Rejected/Failed/Cancelled (+dual-approval over threshold, default ₦500k/$300 equiv configurable).
- Provider interfaces: Paystack/Flutterwave/Korapay webhook HMAC + replay guard (live keys absent → `live_payments=false`, sandbox stub only). USDT/crypto routes return 403 `crypto_disabled` until flag + legal approval. NGN FX display-only.
- Reconciliation job + exception dashboard.

## Phase 6 — Test & Secure
- Coverage: auth/RBAC, marketplace, referral, rewards-disabled, ledger-balance, payout caps, webhook replay, rate-limit, upload validation.
- `npm test` + `npm run test:integration` (ephemeral PG via docker) + security headers + dep audit + backup/restore drill.
- Test report: passed/failed/skipped/blocked-external.

## Phase 7 — Deploy & Handover
- Dockerfiles (backend/frontend), compose.prod, CI (migrate→test→build), DNS/HTTPS/backup/monitoring docs, rollback (`migrate down` + image pin).
- Deliverables §19 checklist + admin bootstrap (no hardcoded password — `npm run admin:create -- --email=...` generates one-time token) + manuals + readiness report.

## Staffing of safeguards (so we never drift into a Ponzi)
| Risk | Guard | Where enforced |
|---|---|---|
| Screenshot activates account | Payment requires signed webhook/s2s confirm | `service_payments` service |
| ROI on deposits | Reward base must be `verified_sales`, funding required | `rewards` service + DB CHECK |
| Recruitment commissions | Basis whitelist, attribution immutable | `referrals` service |
| Fake escrow claims | Copy + no custodial balance table | orders UI + ledger chart |
| Silent rule changes | Rule versioning, calculations pin version | commission/reward tables |
| Budget overrun | `SELECT SUM < budget FOR UPDATE` in tx | campaign payout path |

## Exit criteria (no false "done")
Every feature claims `implemented+tested` only with passing test + audit log + docs. Blocked integrations marked `BLOCKED: needs <credential/decision>` in STATUS.md, never faked.
