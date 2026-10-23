# Payments — Pay2Crypto USDT adapter (sandbox-first; LIVE STAYS OFF)

## 1. Architecture

Pay2Crypto is a **non-custodial USDT gateway**: it generates a per-invoice
deposit address and **settles straight to the merchant wallet** — TOCKINAX
never custodies provider keys. Current scope (researched 2026-10):

- Asset: **USDT only**; Network: **TRC20 (TRON) only**
  (`payment_type=1`, `payment_network=1`).
- REST base `https://api.pay2crypto.com/v1/`, `POST /v1/invoices/create`,
  scoped API tokens, webhook payment notifications carrying the tx hash.
- A sandbox environment exists for integration testing.

Member balances use the shared ledger contract (same as the token module):

- `LIAB:sim_usdt` (LIABILITY, USDT) — per-member SIM-USDT balance.
- `SIM:usdt_clearing` (ASSET, USDT) — clearing.
- A verified deposit posts **DEBIT `SIM:usdt_clearing` / CREDIT
  `LIAB:sim_usdt`** (balanced, idempotent per intent,
  `sourceType='sim_funding'`, `sourceId=<userId>` so the token module's
  `simBalance()` picks it up). Purchases spend it in the token module.
- Currency everywhere in this adapter: **USDT only**.

### Files

| File | Role |
|---|---|
| `backend/src/lib/pay2crypto.js` | Live REST client (create/get invoice, webhook verify). All provider unknowns quarantined in the `ADAPTER MAP` header. |
| `backend/src/lib/pay2crypto-sandbox.js` | In-memory `SIMULATION` fake (create→payable→simulatePay→signed webhook). Refuses to run when `PAY2CRYPTO_SANDBOX=false`. |
| `backend/src/routes/v1.deposits.js` | Auth: intent create (sandbox invoice by default), mine, status. Exports `confirmDepositIntent` (shared credit helper). |
| `backend/src/routes/v1.pay2crypto-webhook.js` | No-auth webhook: verify → dedupe → confirm/expire → audit. |
| `backend/src/routes/v1.withdrawals.js` | Auth + internal finance gates: request/mine + finance queue/review/execute. |
| `backend/db/migrate-payments.cjs` | Standalone `node db/migrate-payments.cjs` (`IF NOT EXISTS`): `deposit_intents`, `withdrawal_requests`, `withdrawal_events` + ledger accounts. Schema `gatedp2p` pinned. |
| `backend/db/seed-payments.cjs` | Sanity check only (verifies `LIAB:sim_usdt` exists). Writes nothing financial. |
| `backend/tests/payments.test.js` | Hermetic offline suite. |

### Mount lines (OWNER must add — `src/app.js` was NOT edited)

```js
app.use('/api/v1/deposits', require('./routes/v1.deposits'));
app.use('/api/v1/withdrawals', require('./routes/v1.withdrawals'));
app.use('/api/v1/pay2crypto-webhook', rateLimit({ windowMs: 60_000, max: 60 }), require('./routes/v1.pay2crypto-webhook'));
```

## 2. Flows

### Deposit (sandbox default)

1. `POST /api/v1/deposits/intent {purpose, amount, network?}` (auth).
   Non-TRC20 → `400 unsupported_network`. Creates `deposit_intents`
   (`created`) + sandbox invoice → row becomes `pending` with
   `provider_invoice_id` + `pay_address`.
2. Response includes pay instructions: `{address, qrPayload, amount,
   currency:'USDT', network:'TRC20', networkDisplay:'USDT — TRON/TRC20 ONLY'}`.
3. Dev/test: `sandbox.simulatePay(invoiceId)` marks paid and returns a
   signed webhook payload.
4. `POST /api/v1/pay2crypto-webhook/pay2crypto` verifies signature, dedupes
   via `payment_provider_events(provider='pay2crypto', event_id)`, loads the
   intent, amount-guards, then credits via `postBalanced` (idempotent
   `sim:funding:<intentId>`). Amount mismatch → intent `failed` +
   `fraud_risk_events` row, **no credit**.
5. `GET /api/v1/deposits/intents/mine`, `GET /api/v1/deposits/intents/:id/status`.

### Deposit (live — currently unreachable by design)

Requested only when `PAY2CRYPTO_SANDBOX=false`. Then the route requires
**both** `feature_flags.live_payments=ON` **and** `PAY2CRYPTO_API_TOKEN` set;
otherwise `409 live_disabled`. The webhook **re-fetches the invoice from the
API before crediting** in live mode.

### Withdrawal

1. `POST /api/v1/withdrawals/request {amount, dest_address}` (auth):
   TRC20 format check (`T…`, 34 base58 chars) → `400 invalid_trc20_address`;
   availability = ledger funding − token spends − open/paid withdrawals →
   `422 insufficient_sim_usdt`. Creates `requested` + event + audit.
2. `GET /mine` (member). Finance: `GET /queue?status=`.
3. `POST /:id/review {approve|reject, note}` (finance/admin): below threshold
   single approval → `approved`; above threshold first approval →
   `under_review` (needs a **different** second approver). Reject →
   `rejected` + reason.
4. `POST /:id/execute` (finance/admin): sandbox → `paid` with
   `sandbox-tx-…`; live (`PAY2CRYPTO_SANDBOX=false`) → **`403
   live_disabled`** (payout API unconfirmed + no sign-off — no transfer
   attempted).

## 3. Sandbox guide

```bash
cd backend
node db/migrate-payments.cjs   # creates tables IF NOT EXISTS
node db/seed-payments.cjs      # sanity check (writes nothing financial)
```

```js
// node REPL sketch (dev only):
const sb = require('./src/lib/pay2crypto-sandbox');
const inv = sb.createInvoice({ amountUsdt: '50.0000', orderId: '<intent-id>' });
const { rawBody, headers } = sb.simulatePay(inv.invoiceId);
// POST rawBody+headers to /api/v1/pay2crypto-webhook/pay2crypto
```

Env defaults: `PAY2CRYPTO_SANDBOX=true`, base
`https://api.pay2crypto.com/v1/`, blank token/secret (sandbox fake signs with
`PAY2CRYPTO_WEBHOOK_SECRET` when set, else offline `sandbox-secret`).

## 4. Env table

| Var | Dev default | Meaning |
|---|---|---|
| `PAY2CRYPTO_BASE_URL` | `https://api.pay2crypto.com/v1/` | REST base (sandbox override TBD — see unknowns). |
| `PAY2CRYPTO_API_TOKEN` | _(blank)_ | Scoped API token. Blank ⇒ live paths `409 live_disabled`. |
| `PAY2CRYPTO_WEBHOOK_SECRET` | _(blank)_ | Webhook HMAC secret. |
| `PAY2CRYPTO_NETWORK` | `TRC20` | Allow-list is code-pinned to `['TRC20']`. |
| `PAY2CRYPTO_SANDBOX` | `true` | `false` requests live paths (still flag+key gated). |

Settlement address is configured **out-of-band with the provider, never in
repo**.

## 5. Go-live checklist (ALL required before `live_payments` is even considered)

- [ ] Pay2Crypto API token issued (scoped) + stored in secrets manager (never repo).
- [ ] Webhook secret issued + configured; signature scheme re-verified (see unknowns).
- [ ] Settlement (merchant wallet) address approved by finance + recorded out-of-band.
- [ ] Legal/compliance sign-off recorded (see `docs/COMPLIANCE_CHECKLIST.md`, `docs/GATE_PROPOSAL.md`).
- [ ] `feature_flags.live_payments` enabled via the governed gate process.
- [ ] Trial amounts: micro-invoice end-to-end (create → pay → webhook → ledger credit → reconciliation) on TRC20.
- [ ] Unknowns below resolved against current provider docs; ADAPTER MAP updated.
- [ ] Withdrawal USDT↔NGN dual-approval equivalence defined (currently raw-number compare).

## 6. Unknowns-to-verify (VERIFY-WITH-DOCS — never assumed)

Attempted `webfetch https://documentation.pay2crypto.com/` once at build
time — **failed (transport error)**, so the safe defaults below stand until
re-verified:

1. **Auth header scheme** — default `Bearer <token>`. Verify: Bearer vs `Token` vs `X-API-Key`, scoping rules.
2. **Webhook signature** — default HMAC-SHA256 over raw body, header
   `x-pay2crypto-signature`, 5-min timestamp tolerance. Verify: algorithm,
   signed layout, header name, timestamp field/tolerance.
3. **Sandbox base URL** — default = live base. Verify dedicated host/path if any.
4. **Invoice status values** — defaults: paid ∈ {paid,confirmed,completed,success};
   fail ∈ {failed,expired,cancelled}. Verify exact vocabulary + transitions.
5. **Invoice create body** — default `{amount, order_id, payment_type:1,
   payment_network:1, currency:'USDT'}`. Verify field names, units (major vs
   minor), required extras (callback URL etc.).
6. **Webhook field layout** — aliased extraction (`event_id/invoice_id/tx_hash/amount/status`).
   Verify canonical names.
7. **Payout/withdrawal API** — unconfirmed; withdrawal live path stays `403` until a
   provider payout endpoint + ops sign-off exist.

## 7. NON-GOALS (explicit)

- **No key storage ever**: private keys / seeds / mnemonics are never accepted,
  stored, or logged (withdrawal request rejects them by design — only a
  destination address is stored).
- **No auto mark-paid without verification**: sandbox callbacks never credit
  live intents; live credits require signature + dedupe + API re-fetch +
  amount match.
- **No silent live enablement**: missing token or flag ⇒ `409/403`, never a
  fallback charge path.
- **No token-module changes**: this adapter only credits `LIAB:sim_usdt`;
  spending/pricing/stages are untouched.
- **No schema renames**: `gatedp2p` stays pinned; migrations are additive `IF NOT EXISTS`.
