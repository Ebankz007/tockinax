# TOCKINAX API reference (`/api/v1`)

Base: `http://localhost:5070/api/v1` (dev) — see `API_URL` in `.env.example`.
Auth: httpOnly cookie `tockinax_at` or `Authorization: Bearer <access>`. Refresh: `POST /auth/login` returns `{ access, refresh }`.
Conventions: JSON; amounts are **decimal strings** (`"2500.5000"`); idempotent writers accept `Idempotency-Key` header.
Health (no auth): `GET /healthz`, `GET /readyz`. Schema stub: `GET /api/v1/openapi.json`.

## Auth — `/api/v1/auth`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/register` | no | `{ email, password≥10, displayName?, referralCode?, acceptTerms:true }` | `201 { user, termsVersion, fee, next:'verify_email' }` (+`devVerifyToken` non-prod) · `409 duplicate` · `400 bad_referral/validation_error` |
| POST | `/auth/verify-email` | no | `{ email, token }` | `200 { ok:true }` · `400 invalid_token` |
| POST | `/auth/login` | no | `{ email, password }` | `200 { access, refresh, referralCode, status }` + cookie · `401 invalid_credentials` · `423 locked` (10 fails → 30 min lock + audit) |
| GET | `/auth/me` | yes | — | `200 { id, email, status, referral_code, display_name }` · `401` |

## Marketplace — `/api/v1/marketplace` (auth required)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/marketplace/listings` | `{ title, description, category?, price:"NNN.NNNN", currency:USD\|NGN, stock?, deliveryTerms? }` (seller flag required) | `201 listing (status pending_review)` · `403 seller_not_enabled` |
| GET | `/marketplace/listings?q&category&page&per` | — | `200 { page, per, items[] }` (active only) |
| POST | `/marketplace/orders` | `{ listingId:uuid, qty?, paymentMethod }` — **extra `amount` ignored; server re-prices `price×qty` + 1% fee** | `201 order (pending_payment, expires 48h)` · `404 listing_unavailable` · `400 cannot_buy_own` |
| POST | `/marketplace/orders/:id/evidence` | `{ providerRef?, note? }` — recorded as PENDING, never auto-completes | `200 { ok:true }` · `404 not_found` · `409 bad_state` (only from pending_payment/evidence_submitted) |

Evidence upload hardening (`src/middleware/upload.js`, 5 MB cap, png/jpg/pdf magic bytes) is exported and documented; wiring into the evidence route via `express.raw` is the Phase-3 step — file fields today are metadata only.

## Referrals — `/api/v1/referrals` (auth required)

| Method | Path | Response |
|---|---|---|
| GET | `/referrals/me` | `200 { referralCode, referralUrl, direct[], byLevel[], commissions[], policy }` — policy: *"Commissions pay ONLY on eligible verified sales after confirmation period…"* · `401` anon |

DB: `referrals` has `CHECK ancestor<>descendant` (`referrals_no_self`) + depth 1–5; closure roll-up to depth 5 on registration.

## Rewards — `/api/v1/rewards` (auth required)

| Method | Path | Response |
|---|---|---|
| GET | `/rewards/campaigns` | `200 [{ …, status, funded, payoutsEnabled:false, note:'Disabled by default…' }]` · `401` anon |
| POST | `/rewards/claim` | `409 rewards_disabled` until `feature_flags.rewards_payouts=true` + funded campaign; else `409 not_eligible` · `401` anon |

Seeds ship `status=draft`, `funding_source=NULL`. Rates are NOT returns on deposits.

## Payouts — `/api/v1/payouts` (auth required)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/payouts/request` | `{ kind:commission\|reward, amount:"N.NNNN", currency:USD\|NGN, destination:{…}, idempotencyKey? }` — `destination` with `privateKey/seed/mnemonic` rejected | `201 payout_request (requested)` · `200 { replayed:true }` on key replay · `400 never_share_keys` · `422 insufficient_eligible + eligible` · `401` anon |
| GET | `/payouts/mine` | — | `200 payout_requests[≤50]` · `401` anon |

Eligible balance = confirmed-`payable` commission/reward calcs only. Dual approval over `PAYOUT_DUAL_APPROVAL_THRESHOLD_NGN` is enforced in admin review (Phase 5 UI).

## Admin — `/api/v1/admin` (auth + `super_admin` role)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/admin/overview` | — | `200 { members, orders, finance, recon }` · `403 admin_only` |
| POST | `/admin/listings/:id/decision` | `{ decision:active\|suspended\|removed, reason? }` | `200 listing` · `404` (audited) |
| POST | `/admin/orders/:id/confirm` | `{ confirm:boolean }` — only from evidence_submitted/under_review; books fee via balanced ledger | `200 { ok, status:completed\|disputed }` · `409 bad_state` (audited) |
| POST | `/admin/campaigns/:id/approve` | `{ fundingSource≥10ch, budgetCap:"N.NNNN" }` — requires funding + budget | `200 { ok:true }` (→scheduled, audited) |

## Crypto — `/api/v1/crypto/*` — always `403 crypto_disabled` until provider/network/legal/ops approvals complete. No private-key storage ever.

## Disputes — `/api/v1/disputes` (auth required)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/disputes/` | `{ orderId:uuid, reason 10–2000ch }` — own orders only; sets order `disputed` | `201 dispute` · `404 order_not_found` · `403 not_party` · `409 order_closed/dispute_open` |
| GET | `/disputes/mine` | — | `200 disputes[≤50]` (opened by me or my orders) |
| GET | `/disputes/:id` | — | `200` party or staff only · `403 forbidden` · `404` |
| POST | `/disputes/:id/assign` | `{ assignee:uuid }` staff (`super_admin/admin/support`) | `200` → `under_review` · `403 staff_only` |
| POST | `/disputes/:id/resolve` | `{ resolution 10–2000ch, outcome:completed\|cancelled }` staff | `200 { orderStatus:resolved_completed\|cancelled }` · `409 already_resolved` |

## Support — `/api/v1/support` (auth required)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/support/tickets` | `{ subject 5–160ch, category?, body 5–5000ch }` | `201 ticket` |
| GET | `/support/tickets/mine` | — | `200 tickets[≤50]` |
| GET | `/support/tickets/:id` | — | `200 { ticket, messages }` — owners never see `internal` notes · `403 forbidden` |
| POST | `/support/tickets/:id/messages` | `{ body, internal? }` — `internal` forced false for non-staff | `201 message` · `409 ticket_closed` (owner reply on closed) |

## Content — `/api/v1/content`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/content/pages/:slug` | no (public) | — | `200 { slug, title, body, updated_at }` · `404 page_not_found` |
| GET | `/content/settings/public` | no (public) | — | `200 { platformName, company, domain, allowedCurrencies, fees, rewards_disabled, crypto_disabled, payoutsEnabled }` — never leaks secrets |
| PUT | `/content/pages/:slug` | super_admin | `{ title, body≤50000 }` (upsert, audited) | `200 page` · `403 admin_only` |

## Users — `/api/v1/users` (auth required)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/users/profile` | — | `200 { user, profile }` |
| PUT | `/users/profile` | strict `{ displayName?, phone?, country:AA?, usdtAddressBep20/Trc20?, avatarUrl? }` — no email change | `200 profile` |
| POST | `/users/seller/apply` | `{ note? }` — dup pending application rejected | `201 { ticket }` · `409 already_seller/application_pending` |
| GET | `/users/notifications` | — | `200 notifications[≤50]` |
| POST | `/users/notifications/:id/read` | — | `200` · `404` |
| GET | `/users/` (super_admin) | `?q&status&page` | `200 { total, page, users }` (no hashes) |
| POST | `/users/:id/suspend` (super_admin) | `{ reason 5–1000ch }` — self-suspend blocked | `200` · `400 cannot_suspend_self` · `404` |
| POST | `/users/:id/reactivate` (super_admin) | — (clears lockout counters) | `200` · `404 not_found_or_not_suspended` |

## Webhooks — `/api/v1/webhooks` (public ingress, HMAC; 60/min)

Record-only until `feature_flags.live_payments=true`. With live off, events are stored
`signature_ok=false` and **never activate** anything. Activation only via finance dual path.

| Method | Path | Verify | Response |
|---|---|---|---|
| POST | `/webhooks/paystack` | HMAC-SHA512 vs `x-paystack-signature`; 10-min timestamp tolerance (`400 stale_event`) | `200 { received, live:false }` (or `live:true, signatureOk, activated:false`) |
| POST | `/webhooks/flutterwave` | `verif-hash` vs `FLW_SECRET_HASH` | same |
| POST | `/webhooks/korapay` | HMAC vs `x-korapay-signature` | same |
| POST | `/webhooks/admin/confirm-service-payment` | auth + finance role; `{ paymentId:uuid, confirm }` on pending only (audited) | `200 { status:confirmed\|failed }` · `403 finance_only` · `409 already_decided` |

## Finance — `/api/v1/finance` (auth + `finance`/`super_admin`)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/finance/ledger/summary` | — | `200 { revenue[], liabilities[], pendingPayouts[] }` |
| GET | `/finance/payouts/queue` | `?status=requested\|under_review` | `200 queue[≤100]` with user email |
| POST | `/finance/payouts/:id/review` | `{ decision:approve\|reject, note? }` — over-threshold needs **two distinct** approvers (`need_second_approver` if same) | `200 { status }` · `422 insufficient_eligible` · `409 bad_state` |
| POST | `/finance/payouts/:id/process` | `{ providerRef }` — approved only; balanced `payout:settle` ledger write, reverts to `approved` on ledger failure | `200 { status:paid }` · `409 must_be_approved` · `502 ledger_error` |
| GET | `/finance/reconciliation` | — | `200 { runs[≤20], imbalances[] }` (must be empty) |
| POST | `/finance/reconciliation/run` | — | `201 run { mismatches, report }` |

## Admin — additions (auth + `super_admin`)

| Method | Path | Response |
|---|---|---|
| POST | `/admin/users/:id/seller { enabled }` | `200 { id, email, seller_enabled }` (audited) |
| GET | `/admin/disputes?status` | `200 disputes[≤100]`, open first |
| GET | `/admin/audit?page&action` | `200 { total, page, logs }` |

## Error codes (extended)

`order_not_found` 404 · `not_party` 403 · `order_closed`/`dispute_open`/`already_resolved`/`already_decided`/`ticket_closed`/`already_seller`/`application_pending` 409 ·
`staff_only`/`finance_only` 403 · `page_not_found` 404 · `cannot_suspend_self` 400 ·
`must_be_approved`/`need_second_approver` 409 · `ledger_error` 502 · `stale_event` 400.

## Error codes

`unauthorized` 401 · `account_blocked` 401 · `validation_error` 400 (+`issues`) ·
`bad_referral` 400 · `cannot_buy_own` 400 · `never_share_keys` 400 ·
`duplicate` 409 · `locked` 423 · `bad_state` 409 · `not_found`/`listing_unavailable` 404 ·
`rewards_disabled`/`not_eligible` 409 · `insufficient_eligible` 422 (+`eligible`) ·
`seller_not_enabled`/`admin_only`/`forbidden` 403 · `crypto_disabled` 403 ·
`cors_origin_denied` 403 · `file_too_large` 413 · `file_type_denied`/`mime_mismatch` 400 ·
`idempotency_key_required` 400 · `internal` 500.

## Token pilot (SIMULATED — TKX-SIM, market-clearing, unsold stays unsold)

| Method + path | Auth | Body → response |
|---|---|---|
| `POST /api/v1/tokens/purchase` | member | `{amount_usdt\|amount, lock_days\|cycle_days: 7\|14}` → 201 `{holding, cycle, pricing}`; 422 `insufficient_sim_usdt`; target = simple cost×(1+1%×days) |
| `GET /api/v1/tokens/holdings` (=`/holdings/mine`) | member | `{items:[{qty, cost_usdt, lock_days, status, matures_at}]}` |
| `GET /api/v1/tokens/cycles` (=`/cycles/mine`) | member | `{items, eligibility:{success_7d/14d, required_7d/14d}}` — success needs settled resale, never time alone |
| `GET /api/v1/tokens/stage/me` (=`/stages/current`) | member | `{current, limits, requirements, upgrade:{fee\|fee_unset}, renewal}` — NULL = TBD placeholder |
| `POST /api/v1/tokens/stage/request` · `/stages/upgrade` · `/stages/renew` | member | `{kind}` → 201 pending or 409 `fee_unset` / `max_stage` |
| `GET /api/v1/tokens/stages` · `/stages/config` | member | definitions (read-only; `PUT` → 409 `configuration_locked`) |
| `GET /api/v1/tokens/definitions` · `/pricing-versions` · `/categories` | member | TKX-SIM spec, versioned simple-pricing rows, 8 DISABLED categories |
| `GET /api/v1/tokens/commissions` | member | by category+generation (empty until rules approved+funded) |
| `GET /api/v1/tokens/statement` | member | `{lines}` JSON for CSV export |
| `GET /api/v1/tokens/admin/kpis` | staff | counts + `simulated:true`; member → 403 |
| `GET /api/v1/tokenmarket/listings` | member | open/partial, search/sort/page; remaining bars |
| `POST /api/v1/tokenmarket/listings/:id/buy` | member | `{qty}` (TKX units) → 201 fill + `remaining_qty`; 409 `insufficient_remaining`; oversell-safe (`FOR UPDATE`) |
| `GET /api/v1/tokenmarket/fills/mine` · `/proceeds` | member | receipts + unsold balances (unsold stays visible) |
| `GET /api/v1/tokenmarket/admin/listings` · `POST .../decision {approve}` | finance | oversight; `approve:false` cancels open/partial + audit |

## Pay2Crypto USDT deposits + withdrawals (sandbox-first; live gated OFF)

| Method + path | Auth | Notes |
|---|---|---|
| `POST /api/v1/deposits/intent` (=`/intents`) | member | `{purpose: registration_fee\|token_purchase\|stage_upgrade\|stage_renewal, amount, network=TRC20}` — non-TRC20 → 400 `unsupported_network`; live w/o keys → 409 `live_disabled` |
| `GET /api/v1/deposits/mine` (=`/intents/mine`) · `GET /intents/:id/status` | member | history incl. `tx_hash` |
| `POST /api/v1/deposits/:id/simulate-pay` | member(owner) | sandbox ONLY → confirmed + SIM-USDT credited (balanced, idempotent) |
| `POST /api/v1/pay2crypto-webhook` | HMAC | verify → dedupe → confirm; bad signature 400, never 500 |
| `POST /api/v1/withdrawals/request` | member | `{amount, dest_address}` TRC20 `^T[…]{33}$`; 422 if insufficient available |
| `GET /api/v1/withdrawals/mine` | member | history |
| `GET /api/v1/withdrawals/queue` (=`/admin/queue`) · `POST /:id/review {approve\|reject}` · `POST /:id/execute` | finance | dual approval above threshold; execute sandbox → paid w/ `sandbox-tx-*`, live → 403 `live_disabled` |
| `GET /api/v1/deposits/admin/queue` · `POST /admin/:id/decision {cancel}` | finance | oversight |

New token error codes: `fee_unset`/`configuration_locked`/`max_stage` 409 · `unsupported_network`/`invalid_trc20_address` 400 · `live_disabled` 409/403 · `insufficient_sim_usdt`/`insufficient_remaining` 422/409 · `need_second_approver` 409.
