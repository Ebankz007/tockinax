# TOCKINAX Token Model — Participation Token (TKX)

> **Not a security, not an investment, no returns on deposits.**
> Token-quantity movements are MEMO-style records in token tables (no TKX ledger legs).
> USDT legs balance in USDT via `postBalanced()` (Decimal.js, idempotent).
> Target prices are not guaranteed — sale requires a willing buyer; unsold stays unsold.

## 1. Token definition (seeded)

| field | value |
|---|---|
| code | `TKX` |
| name | TOCKINAX Participation Token |
| kind | `STANDARD` |
| supply | 10,000,000 |
| basis | `1 TKX = 1 USDT at mint/purchase; off-platform transfers disabled` |
| rights | `none — participation record` |

Off-platform transfers are disabled by policy (no transfer endpoint ships).

## 2. Contract codes (exact, read by payments module)

| account | type | ccy | purpose |
|---|---|---|---|
| `LIAB:sim_usdt` | LIABILITY | USDT | member USDT liability (company owes funded members) |
| `SIM:usdt_clearing` | ASSET | USDT | clearing for purchase + secondary settlement |

These are internal accounting identifiers and are not shown in the UI.

## 3. Pricing formula (simple interest only)

Active `pricing_rules` row per lock term (approved plan):

- v1, 7d, `rate_bps_per_day = 60`, basis `simple`, active → 4.20%
- v1, 14d, `rate_bps_per_day = 75`, basis `simple`, active → 10.50%
- v1, 30d, `rate_bps_per_day = 100`, basis `simple`, active → 30.00%

```
total = cost * (1 + rate_bps_per_day * lock_days / 10000)
unit  = total / qty            (mint 1:1, so qty == cost numerically)
```

Examples: 100 / 7d → 104.2000 (unit 1.0420); 100 / 14d → 110.5000 (unit 1.1050);
100 / 30d → 130.0000 (unit 1.3000).
Compound math is NEVER used — see `tests/token.test.js` simple-not-compound proof.
`targetPrice()` throws `no_active_pricing_rule` when no active rule exists.

## 4. Holdings + participation cycles

- **Account insurance gate:** `POST /api/v1/tokens/purchase` requires the account-level
  insurance membership (`users.insurance_active = true`). Insurance is activated once per
  account (`POST /auth/insurance/activate`) and is never attached to a token or lock term.
- `POST /api/v1/tokens/purchase {amount_usdt, lock_days 7|14|30, settlement_option}`:
  stage range check → `simBalance()` funding check → create a `pending_approval` holding
  (no ledger movement, no cycle). The purchase is manually reviewed by an admin.
- `POST /api/v1/admin/token-purchases/:id/approve` (super_admin): posts the balanced USDT
  debit (`debit LIAB:sim_usdt / credit SIM:usdt_clearing`), sets `status='locked'`,
  resets `purchased_at = now()` and `matures_at = now() + lock_days`, and creates the
  `participation_cycles` row (`started`). Reject cancels the holding.
- `settlement_option` is chosen at purchase: `marketplace` (default) or `company_reserve`.
- `matureDue()` (sweeper): `locked` + `matures_at < now()` →
  - `marketplace`: `matured` + auto-create `token_listings` at target price (idempotent
    per `holding_id` unique; re-links `listing_id` on replay).
  - `company_reserve`: `settlement_pending`, awaiting manual admin payout.
- `settleCompanyHolding()` (admin only, via `POST /admin/token-settlements/:id/approve`):
  restricted to `settlement_pending`; pays cost + 90% of the projected profit, charges
  10% of the profit to `REV:settlement_fees`, and posts a balanced ledger transaction.
- `settleDue()` (sweeper): listing `filled` (remaining 0) → holding `settled` +
  cycle `settled_at = now(), success = true, status = settled`.
- **Cycle success definition:** `success = true` IFF the holding's listing reached
  `remaining_qty = 0` AND status `filled` AND the holding was marked `settled`.
  Partial fills credit proceeds at fill time but do NOT mark success.

## 5. Secondary market — market-clearing, unsold stays unsold

- `GET /api/v1/tokenmarket/listings` — `open`/`partial` only, search/sort/paginate.
- `POST /api/v1/tokenmarket/listings/:id/buy {qty}` — `SELECT ... FOR UPDATE`,
  `validateBuyQty()` oversell guard, buyer `simBalance()` check, single 4-leg balanced
  USDT settlement (buyer out via LIAB→clearing, seller in via clearing→LIAB),
  `remaining_qty` decrement (`filled` when 0), idempotent `token_fills` insert.
  A fill completes ONLY here on settled payment — no evidence/screenshot path completes orders.
- `GET /api/v1/tokenmarket/proceeds` — seller receipts + unsold listings.
  **Unsold policy:** unsold qty stays listed and visible; no buy-back, no auto-complete,
  no price fiction, no expiry fiction (only explicit `cancelled`/`expired` states).

## 6. Stages (approved plan — eligible range + entry fee)

| stage | name | min_buy | max_buy | entry fee | generations |
|---|---|---|---|---|---|
| 1 | Entry | 50 | 500 | 20 (registration) | 1 |
| 2 | Growth | 500.01 | 2,000 | 25 | 2 |
| 3 | Advanced | 2,000.01 | 5,000 | 50 | 3 |
| 4 | Premium | 5,000.01 | 50,000 | 100 | 3 |
| 5 | Elite | 50,000.01 | 100,000 | 250 | 3 |

`upgrade_fee` is the fee to **enter** that stage (Stage 1 = the $20 registration fee).
`renewal_fee` is `NULL` — the approved plan publishes no renewal fee, so renewal requests
return **409 `fee_unset`**. Progression depends on the eligible locking range and the stage
entry fee, not on counting cycles (`req_cycles_7d/14d = 0`).

## 7. Referrals / commissions gates (no live enablement)

- Three referral generations only. `STAGE_GENS = {1:1, 2:2, 3:3, 4:3, 5:3}`;
  depth is payable only if `depth <= maxGenForStage(beneficiary stage)`.
- `commission_categories` seeds: `referral_gen1/2/3` (all `active = false`).
- Each eligible $20 registration splits $5 / $2 / $1 / $2 / $2 / $8 across
  generation 1, generation 2, generation 3, leadership pool, processing and administration.
- `commission_rules` seed rows all `active = false`; engine queries `active = true` only →
  records nothing payable (verified).
- Gated calculator `calculateGatedForOrder()` additionally requires the rule's category to be active.
- No live enablement anywhere in this change.
