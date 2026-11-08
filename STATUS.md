# STATUS — TOCKINAX readiness tracker (updated 2026-11-08, approved-plan alignment)

## Approved-plan alignment (2026-11-08)
- LOCK TERMS: 7d 0.60%/day → 4.20% (100 → 104.20), 14d 0.75%/day → 10.50% (100 → 110.50),
  30d 1.00%/day → 30.00% (100 → 130.00). Simple, non-compounded. `pricing_rules` v1 seeded
  for all three terms; `tokenPricing.js` validates `[7,14,30]`.
- STAGES: approved ranges + entry fees — S1 50–500/$20 (registration), S2 500.01–2,000/$25,
  S3 2,000.01–5,000/$50, S4 5,000.01–50,000/$100, S5 50,000.01–100,000/$250. Progression is
  by eligible range + entry fee; `req_cycles_7d/14d = 0`. `renewal_fee = NULL` (renewal
  requests return 409 `fee_unset`).
- REFERRALS: three generations only (`STAGE_GENS = {1:1,2:2,3:3,4:3,5:3}`), categories
  reduced to `referral_gen1/2/3`. Registration $20 split $5/$2/$1/$2/$2/$8. All rules
  inactive / payouts gated (`feesEnforced: false`).
- INSURANCE: account-level membership only (`POST /auth/insurance/activate`,
  `GET /auth/insurance/status`). Token purchases require active account insurance and are
  queued `pending_approval` for manual admin review. Per-token `POST /insurance/purchase`
  retired (410 `account_level_insurance_only`); `insurance_claims.policy_id` nullable.
- SETTLEMENT: per-holding `settlement_option` (`marketplace` default | `company_reserve`).
  Company-funded settlement charges 10% of projected profit, is paid manually from the
  company reserve after admin approval (`settlement_pending` → `settled`), and posts a
  balanced ledger transaction. Admin UI: `/admin/approvals` (purchases + settlements +
  insurance members) and `/admin/insurance` (members + claims).
- UI/BACKEND COPY: all SIM/"SIMULATED pilot"/simulator naming and MMITPS INC removed.
  Logout beside Change password on dashboard/admin; Forgot password only on login.
- VERIFIED (2026-11-08): jest **10 suites, 77 passed, 0 skipped** with a live
  Postgres (`payout-eligibility` suite added); token-smoke **32/32**; live-smoke
  **35/35**; cover-check **43/43**; frontend production build PASS; migrate +
  `seed` run twice (idempotent). Company-settlement check balanced (profit 4.20,
  fee 0.42, net 103.78, balance 900 → 1003.78).
- DOCKER FIX: `docker images` failed on "Build frontend image" because a
  frontend-only `npm ci` omitted `@types/node`; Next 15 then auto-installed deps
  and upgraded itself mid-build. `frontend/package.json` now declares
  `@types/node ^26.6.6`, which hoists to the ROOT `node_modules` — the only tree
  the builder stage copies. Clean-install builder simulation reproduces the exact
  Docker stage and passes. `.dockerignore` also excludes `ooo/`,
  `tockinax 1st build/` and `*.zip` so untracked local material can never enter
  the build context.
- DEPLOY NOTE: the pm2 cron deploy runs migrations only. Run
  `npm run db:seed --workspace=backend` on the server after deploy so the
  pricing/stage/referral rows and the legacy `TKX-SIM` / branding cleanup apply.

## Production audit (2026-11-08)

- PRODUCTION DB (read-only): `pricing_rules` v1 = 60/75/100 bps/day simple;
  `stage_definitions` 1–5 ranges and entry fees 20/25/50/100/250 with
  `renewal_fee NULL`; `registration_fee_split` = $5/$2/$1/$2/$2/$8;
  `commission_categories`/`rules` recorded but inactive; ledger 0 transactions,
  0 entries, balanced, no duplicate idempotency keys; 3 users (2 `pending_email`,
  1 active `super_admin`); 1 audit log.
- STALE DATA FIXED IN SEED: production had an unreferenced `TKX-SIM` token
  definition (0 holdings, 0 policies) and `system_settings.platform.company =
  "MMITPS INC"`. `seed.cjs` now deletes `TKX-SIM` only when unreferenced
  (otherwise deactivates it to preserve historical FKs) and updates `company`
  only when it is exactly `MMITPS INC`, leaving admin-edited name/domain alone.
  Seed is safe to re-run; no balances, ledger rows, holdings or history are
  overwritten.
- DUPLICATE PAYOUT FIX: commission/reward calculation rows stay `payable` after a
  payout is requested or paid, so the old eligibility query could fund the same
  balance twice. `src/lib/payoutEligibility.js` now subtracts every
  `payout_requests` row in `requested/under_review/approved/processing/paid`
  (commission/reward kinds only; insurance claims excluded). The request path
  runs inside a transaction with a per-user+currency advisory lock, and the
  finance review path excludes the request being reviewed. New
  `tests/payout-eligibility.test.js` proves subtraction, review exclusion and
  release on rejection.
- UI/API: removed the leftover `simulated: true` field from the staff token KPI
  response. No SIM/simulator naming, no MMITPS INC branding.
- SECURITY FINDINGS STILL OPEN (reported, not silently changed):
  1. Production sandbox lets any authenticated member self-credit USDT through
     `POST /deposits/:id/simulate-pay` while `PAY2CRYPTO_SANDBOX=true`.
  2. Global and auth rate limits are commented out (debug commit `8b16616`).
  3. Forgot-password stores a token and only console-logs it; no reset endpoint.
  4. Account insurance self-activates without payment or admin approval.
  5. Sandbox withdrawal execution marks `paid` without a balanced ledger posting.
  6. `express.json({limit:'256kb'})` is intentional; internal ledger identifiers
     (`LIAB:sim_usdt`, `SIM:usdt_clearing`) are not user-facing.
- DOCKER: local Docker Desktop/WSL2 is unavailable on this host, so image
  build/run is verified by the CI `docker images` job (buildx, root context) and
  by the clean-install builder-stage simulation. The pm2 deploy gate remains
  `unit` + `integration (postgres)` + `frontend build`; container images are
  publish-only.

## Completed
- [x] Phase 1: inspection + ARCHITECTURE.md + IMPLEMENTATION_PLAN.md
- [x] Phase 2: foundation (auth register/verify/login, RBAC, Drizzle 28-table schema, migrate+seed, ledger.postBalanced, frontend shell)
- [x] Phase 3: marketplace (listings CRUD + moderation, server-priced orders, evidence≠proof, disputes open/assign/resolve, support tickets, expiry policy via order expiresAt + sweeper hook point)
- [x] Phase 4: referrals (immutable attribution, closure depth≤5, cycle/self guards, fraud detectors) + commissions engine (versioned rules, eligible_verified_sales only, budget cap, idempotent, reversal) + rewards (Stage A/B DRAFT unfunded, claim 409, payoutsEnabled false)
- [x] Phase 5: ledger double-entry (balanced, idempotent, Decimal) + payouts (eligible-balance check, dual approval over threshold, provider-ref settle, ledger-or-revert) + webhooks (HMAC stub-verify, dedupe, live:false) + FX indicative + notifications in-app + mail/storage stubs
- [x] Phase 6: 6 jest suites green offline + HSTS/CORS/rate-limit + validate/idempotency/upload middleware + frontend 26 pages build PASS + admin dashboards (overview/moderation/finance/content/users)
- [x] Phase 7: Dockerfiles + compose.prod + CI + docs (API/DEPLOYMENT/ADMIN/USER/SECURITY/BACKUP) + .env.example placeholders-only + admin:create (no hardcoded password)

## Live-DB smoke (2026-10-15, shared PG mmitps_dev:5433 schema gatedp2p + Redis:6379 — Docker daemon down, compose deferred)
- PASS: `npm run db:migrate` + `npm run db:seed` green. `node live-smoke.cjs` (in-process supertest, `npm run test:live`) → **28 passed, 0 failed**:
  register+fee disclosure → verify → login → seller listing (hidden pre-approval) → admin approve → order server-priced (tamper `amount:1.00` ignored, charged 200.00 for 2×100) + no-escrow copy → evidence stays `evidence_submitted` (NOT auto-completed) → dispute open (order→`disputed`) → dispute resolve → clean order → admin confirm → `completed` + fee revenue 1.0000 booked + entry balanced → inactive rules pay 0 → one-shot v99 rule pays L1 to independent referrer + idempotent replay → rewards claim 409 → crypto 403 → privateKey 400 → insufficient 422 → public terms 200 → member admin 403 → admin overview 200.
- FIXED live: enum-cast bug `42P08 inconsistent types` in `admin/orders/:id/confirm` + `disputes/:id/resolve` (`$1::order_status`, `$2::text` compare) — 3 smoke failures → green. Commission "miss" was correct wash-guard (ancestor==seller skipped); smoke now uses independent referrer.
- PASS: `npm test -- --ci` still **6 suites, 26 passed, 7 skipped, 0 failed** after fixes. `node src/workers/sweeper.cjs --once` → `{"expired":0,"rolled":0,"slaFlagged":0}` (no stale work; rollup correctly idle while rules inactive).
## Proceed phase (2026-10-15 — uploads wired, lockfile + Docker fixed, money gates untouched)
- UPLOADS: `POST /marketplace/orders/:id/evidence/file` (raw png/jpg/pdf ≤5MB, magic-byte verified, private disk, PENDING only) + `GET .../evidence` (metadata) + `GET /marketplace/evidence/:id/file` (party/staff-only download, stranger 403) + `POST /marketplace/listings/:id/images` (seller-owned, images only). Storage default aligned to `uploads-private/` (gitignored). No auto-complete on upload — screenshot≠proof holds for files too.
- TESTS: new `backend/tests/uploads.test.js` (3 hermetic: sniff png/jpg/pdf vs text, allow/deny, mime-mismatch + required/optional) → full `npm test` now **7 suites, 29 passed, 7 skipped, 0 failed**. Live-smoke extended with 6 file round-trip checks (upload 201 → still pending → text denied 400 → metadata has_file → download png magic → stranger 403) → `node live-smoke.cjs` now **34 passed, 0 failed**.
- BUILDS: root `package-lock.json` refreshed from workspace root (lock v3, 556 pkgs, workspaces backend+frontend — single lock is correct for npm workspaces). `backend/Dockerfile` + `frontend/Dockerfile` rewritten workspace-aware (build from root, `npm ci --workspace=...`) + `compose.prod` contexts fixed. Frontend `npm run build` still PASS (static prerender intact).
- MONEY GATES: untouched — live payments OFF, rewards OFF (Stage A/B DRAFT), crypto 403. Sweeper rollup stays idle while rules inactive (verified `rolled:0`).
- REMAINING: Docker daemon down (compose build not run — CI builds); 7 jest skips are live-DB placeholders covered by live-smoke; 6 external approvals (fees, provider keys, USDT network, reward funding, SMTP/S3/SMS) still BLOCKED by design.

## Blocked / needs external decision (not faked)
- BLOCKED: platform/company/domain final values (defaults: gatedp2p / TOCKINAX / TBD)
- BLOCKED: registration fee amount/currency (default 0) — needs business + refund sign-off
- BLOCKED: Paystack/Flutterwave/Korapay live keys + webhook secrets — integrations stub-only
- BLOCKED: USDT network (BEP20/TRC20) + legal approval — crypto stays 403
- BLOCKED: reward funding source + campaign budgets + legal approval — Stage A/B stay DRAFT
- BLOCKED: SMS provider, S3 bucket, SMTP relay — notifications in-app + console stub

## Test report (2026-10-13, honest)
- PASS: jest foundation suite 3/3 (healthz, crypto-locked 403, registration validation).
- PASS: migrate + seed green on shared PG (schema `gatedp2p` in mmitps_dev @5433; Docker daemon down so compose DB deferred to prod).
- PASS: live smoke on :5070 — register 201 (fee disclosed) → verify 200 → login 200 → referrals/me 200 → rewards DRAFT visible → crypto 403.
- NOTE: jest log shows one expected 500 line from Zod-invalid input path (assertion still ≥400 PASS).
- API running in background (node src/server.js, :5070). DB: existing PG:5433 + Redis:6379 (shared dev infra, isolated `gatedp2p` schema).

## Test report (2026-10-15 hardening pass, honest, OFFLINE — no live DB)
- PASS: `cd backend && npm test -- --ci` → 6 suites, 26 passed, 7 skipped, 0 failed.
  - marketplace (6): 401 anon on orders/evidence/listings; helmet HSTS + headers; CORS allow-list (evil origin 403); zod strips client `amount` + Decimal price×qty check.
  - referrals (3): 401 anon; policy text verified-sales; `referrals_no_self` + depth checks in schema.
  - rewards (4): 401 anon on campaigns/claim; `payoutsEnabled:false` + `rewards_disabled`; seed draft.
  - ledger (6): balanced commit, unbalanced throws, negative-leg throws, dual-side-leg throws, idempotent replay `replayed:true`, missing-key throws (in-memory fake client, no DB).
  - payouts (4): 401 anon ×2; `never_share_keys` + 400 path; `insufficient_eligible` + 422 path.
  - foundation (3): pre-existing, still green.
  - 7 skipped = live-DB placeholders (`describe.skip` without DATABASE_URL): draft-evidence 409, server-priced order, circular-insert violation, seed draft query, authed claim 409, authed never_share_keys/insufficient_eligible.
- AUDIT: `npm audit --omit=dev` → 0 critical, **5 high (all nodemailer ≤10.0.5)** — SMTP-injection/CRLF/DoS advisories; fix is breaking major (`npm audit fix --force` → 10.x), NOT applied; mail is dev-console-stub until SMTP relay approved. Re-check before each release.
- DOCKER: backend/Dockerfile + frontend/Dockerfile + docker-compose.prod.yml + CI workflow + .dockerignores present (verified via ls). `docker build` not run — daemon unavailable in this environment; CI builds both images. No backend/frontend package-lock.json committed, so Dockerfiles/CI use `npm ci || npm install` fallback (commit lockfiles to make builds fully reproducible).
- NOT claimed: live payments, reward payouts, crypto settlement (all still gated OFF).
  New this pass: disputes/support/content/users/webhooks/finance/admin-extension routes
  exist in code (merged parallel work, present in `backend/src/routes/`, docs/API.md updated)
  but are **not covered by the offline jest run** (DB-dependent) and **not smoke-tested here** —
  verify against a live DB before relying on them.
  (Superseded: live-smoke 34/34 green 2026-10-15 — see Live-DB smoke section above.)

## Recommendation phase (2026-10-15 — deployable on current host + commercial proposal, gates still shut)
- RECOMMENDATION EXECUTED: no money gate opened. Instead (a) platform made deployable on
  this Windows host without Docker, (b) one crisp 8-gate commercial proposal written for signing.
- WINDOWS RUNBOOK (`deploy/windows/`): `ecosystem.config.js` (PM2: backend cluster x2 :5070,
  frontend :3001, sweeper cron every 2min; `node --check` clean), `backup.ps1` (pg_dump custom
  format + 30d retention, tokenizer-clean), `healthcheck.ps1` (healthz/readyz/site probe, exit 1
  on fail), `Caddyfile.sample` (TLS reverse proxy), `RUNBOOK.md` (install from repo ROOT, PM2 +
  Task Scheduler boot/backup/health tasks, restore drill, rollback, kill-switch flags), plus root
  `.env.production.example` (placeholders only — scanned, only empty `*_KEY=` names present).
  Verified: pg_dump at `C:\Program Files\PostgreSQL\16\bin\pg_dump.exe`, PG16 service Running.
- GATE PROPOSAL (`docs/GATE_PROPOSAL.md`): 8 gates in opening order with exact flip commands +
  cost-if-wrong + sign-off table. Headline calls: registration stays $0 to 500 traders; platform
  fee stays 1%; payout min $10/NGN5k + NGN500k dual; commissions L1-3 ONLY after 100 verified sales
  + $1,000 OPS-funded pilot (L4/L5 off); Stage A/B ONLY on 90-day fee revenue covering budget 3x;
  fiat after provider+compliance; USDT 403 until legal opinion + single network (BEP20 first);
  FX manual-weekly. Premortem included. NOTHING APPLIED — signatures required.
- HYGIENE: `.gitignore` += `logs/`, `.env.production`, `*.dump`. Lesson: keep non-ASCII out of
  `.ps1` files (Win PowerShell 5.1 legacy tokenizer chokes — fixed 2 em-dashes today).
- UNTOUCHED: all *_ENABLED=false, rewards DRAFT, crypto 403, commission rules inactive.

## Rebrand (2026-10-15 — gatedp2p → TOCKINAX, at Henry's request)
- Root folder renamed `gatedp2p/` → `TOCKINAX/`; 38 files swept (`tockinax` identifiers,
  `TKX-` order prefix, `tockinax_at` cookie, PM2/compose/CI names, backup filenames, docs,
  frontend brand, `PLATFORM_NAME=TOCKINAX`, seed platform `TOCKINAX`).
- PINNED legacy (deliberate, documented in ARCHITECTURE.md §4): Postgres schema stays
  `gatedp2p` (`search_path`, `CREATE SCHEMA`, `gatedp2p_app` role, dev `.env` DATABASE_URL)
  — live dev data lives under it; renaming buys nothing. New prod DBs may be named
  `tockinax_prod` with the same schema name.
- VERIFIED post-rename: jest 7 suites 29 passed / 7 skipped, live-smoke 34/34, frontend
  build compiled, root lock regenerated (`tockinax`, 556 pkgs).

## Token marketplace build (2026-10-16 — Henry decisions: TOCKINAX spelling, sim token, market-clearing pilot, fee placeholders, Pay2Crypto gateway sandbox-first) *(historical — superseded by Approved-plan alignment 2026-11-08)*
- TOKEN MODULES: `token_definitions` (TKX-SIM: supply 10M, 1 TKX = 1 USDT sim basis, off-platform transfers disabled, rights none), versioned simple pricing (7d→107%, 14d→114%, never compounded), holdings + locks, maturity job (auto-list at target, idempotent), partial-fill marketplace (`FOR UPDATE`, oversell-proof), participation cycles (success = lock + FULLY SETTLED resale), 5 stage definitions (limits/fees NULL placeholders; upgrades/renewals 409 `fee_unset`), 8 commission categories (all DISABLED, rates NULL), stage→generation gates (1→1 … 5→5), member_no `TKX-*`.
- PAYMENTS: Pay2Crypto adapter (researched: non-custodial, USDT TRC20-only, scoped tokens, sandbox env, https://api.pay2crypto.com/v1/; docs site unfetchable — unknowns isolated in adapter MAP + docs/PAYMENTS_PAY2CRYPTO.md). Deposit intents → sandbox invoice → simulate-pay/webhook → SIM-USDT credited (balanced, idempotent). TRC20-only enforced (BEP20/ERC20 → 400). Withdrawals: TRC20 validation, dual approval, sandbox execution; live → 409/403 everywhere without keys. No key storage anywhere.
- INTEGRATION FIXES by owner: `currency/base/quote` widened varchar(3)→(8) (USDT needs 4 chars); deposit insert missing idempotency value; fill idempotency hashed to fit varchar(96); Zod errors now 400 `invalid_input` (was 500); purchase accepts frontend field aliases; compat layer (`v1.tokencompat.js`) aligns all frontend-assumed paths + adds read-only stage config, categories, KPIs, admin oversight for token listings/deposits/withdrawals. Frontend untouched — its tolerant client + new aliases cover every assumed URL.
- VERIFIED: migrate + migrate-payments + seed + seed-payments green; jest **9 suites, 63 passed, 7 skipped**; live-smoke 34/34; token-smoke **30/30** (deposit→fund→buy→mature→auto-list 1140→partial fills→oversell rejected→cycle success→unsold visible→fee_unset→disabled commissions). Money gates still shut: live payments OFF, rewards DRAFT, crypto 403, commission rules inactive, stage config 409-locked.

## Frontend↔backend contract proof (2026-10-16 — every assumed URL audited live)
- New `backend/cover-check.cjs` (43 checks, member + super_admin): all 14 member token/market/deposit/withdrawal reads, fee_unset + config-locked (403 member / 409 admin) paths, kpis RBAC, full admin chain — token-listing stand, deposit cancel (+cancelled intent correctly refuses simulate-pay), withdrawal request→queue→approve→sandbox execute→paid.
- FIXES from audit: sandbox `simulate-pay` now records the provider event (webhook-identical semantics) and returns a real `sandbox-tx-*` hash (was null); Zod 400s hold across new routes; `PUT /stages/config` correctly 403/409 (audit script itself was sending POST — fixed).
- Sweeper extended verified: `{"expired":0,"rolled":0,"slaFlagged":0,"tokenMatured":0,"tokenSettled":0}` (maturity/settlement jobs wired, idle with nothing due). Frontend rebuild green (compiled successfully). No "module deploying" states remain on any wired journey.

## Community & weekly rewards (2026-11-08)

- DATABASE: 14 new append-only, idempotent tables in `gatedp2p`: `testimonials`, `testimonial_media`, `testimonial_views`, `social_media_accounts`, `social_media_submissions`, `social_media_verifications`, `weekly_competitions`, `competition_participants`, `competition_leaderboards`, `weekly_bonus_configurations`, `weekly_bonus_awards`, `weekly_bonus_transactions`, `notification_feed`, `competition_audit_logs`. `notifications` extended with `category`/`link`/`meta`. Ledger accounts `EXP:community_bonuses` / `OPS:community_bonus_funding` seeded. Permission `community.manage` granted to `finance` + `super_admin`.
- BACKEND: `src/lib/community.js` — timezone-aware week windows (`start_dow/time`, `end_dow/time`), view dedup bucket (`view_dedup_hours`), bot/suspicion scoring (UA patterns, IP flood, view spikes), top-5 ranking per kind (testimonial views / verified referrals), provisional finalize, admin approve/disqualify/pay via `postBalanced(source_type='community_bonus', idempotencyKey='community_bonus:<award_id>')`, announcement publish to all/members/winners/admins. `src/middleware/upload.js` — `mediaUpload()`: magic-byte (WebP/MP4/MOV), configurable size limits, optional MP4 mvhd duration parse, EICAR malware guard. `src/middleware/auth.js` — added `optionalAuth`. Routes: `v1.community.js` (public + member), `v1.community-admin.js` (admin, mounted BEFORE `/api/v1/admin`). `v1.withdrawals.js` `availableSimUsdt()` includes `community_bonus` credits. `v1.users.js` notifications extended with `?category` and `?unread=1` + `POST /notifications/read-all`.
- SEED: `community_rewards` flag ON, `community_bonus_payouts` OFF (needs funded pool). Official social channels seeded as placeholders (Telegram/YouTube/X/Instagram/Facebook). Bonus configs seeded with zero rewards (admin must fund). `community_rewards` system_settings with view policy + limits. Content pages `testimonials` + `community-rules`.
- FRONTEND: `/testimonials` public page (video/image/written tabs, featured section, social sharing, view counter). `components/SocialIcons.tsx` (header + footer + dashboard). `/dashboard/community` member tabbed page (My Testimonials, Submit Testimonial, My Social Posts, Promote Us, Weekly Leaderboards, My Bonus History, Competition Rules). `/admin/community` admin tabbed page (Testimonials moderation, Social Media accounts/submissions, Competitions snapshot/finalize/cancel, Bonus config/awards/pay, Announcements). Nav + footer links added. `frontend/lib/api.ts` — community types + `uploadRaw()` helper. Production build PASS.
- TESTS: `backend/tests/community.test.js` — week windows, magic-byte sniff, media guard, DB-guarded: public testimonials/view dedup/bot detection, leaderboard top-5 ranking, finalize→approve→pay idempotency + ledger credit. `npm test` → 11 suites, 76 passed, 10 skipped (offline skips). Live-DB community integration tests pass against shared PG.
- GATES STILL SHUT: `community_bonus_payouts` flag OFF by default — bonus payments require an admin-funded pool (`OPS:community_bonus_funding`) and explicit flag enable. No reward amount is hardcoded anywhere; all values come from `weekly_bonus_configurations`. Existing three-generation referral commissions and commission_calculations are untouched — the referral weekly bonus is a separate, independent table.
