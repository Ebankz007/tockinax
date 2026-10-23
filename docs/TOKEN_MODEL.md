# TOCKINAX Token Model — Simulated-Token Pilot (TKX-SIM)

> **SIMULATED pilot. Not a security, not an investment, no returns on deposits.**
> Token-quantity movements are MEMO-style records in token tables (no TKX ledger legs).
> USDT legs balance in USDT via `postBalanced()` (Decimal.js, idempotent).

## 1. Token definition (seeded)

| field | value |
|---|---|
| code | `TKX-SIM` |
| name | TKX Simulated Token (SIMULATED — clearly labelled) |
| kind | `SIMULATED` |
| supply | 10,000,000 |
| basis | `1 TKX = 1 USDT at mint/purchase; off-platform transfers disabled` |
| rights | `none — simulated participation record` |

Off-platform transfers are disabled by policy (no transfer endpoint ships).

## 2. Contract codes (exact, read by payments module)

| account | type | ccy | purpose |
|---|---|---|---|
| `LIAB:sim_usdt` | LIABILITY | USDT | member SIM-USDT liability (company owes funded members) |
| `SIM:usdt_clearing` | ASSET | USDT | clearing for purchase + secondary settlement |

## 3. Pricing formula (simple interest only)

Active `pricing_rules` row per lock term:

- v1, 7d, `rate_bps_per_day = 100`, basis `simple`, active
- v1, 14d, `rate_bps_per_day = 100`, basis `simple`, active

Term totals: 7d → 700 bps (7%), 14d → 1400 bps (14%).

```
total = cost * (1 + rate_bps_per_day * lock_days / 10000)
unit  = total / qty            (mint 1:1, so qty == cost numerically)
```

Examples: 100 / 7d → 107.0000 (unit 1.0700); 100 / 14d → 114.0000 (unit 1.1400).
Compound (`100*1.01^14 ≈ 114.95`) is NEVER used — see `tests/token.test.js` simple-not-compound proof.
`targetPrice()` throws `no_active_pricing_rule` when no active rule exists.

## 4. Holdings + participation cycles

- `POST /api/v1/tokens/purchase {amount_usdt, lock_days 7|14}`:
  stage limit check (NULL = unlimited) → `simBalance()` funding check →
  balanced USDT legs (`debit LIAB:sim_usdt / credit SIM:usdt_clearing`) →
  `token_holdings` (`locked`, `matures_at = purchased_at + lock_days`) +
  `participation_cycles` (`started`).
- `matureDue()` (sweeper): `locked` + `matures_at < now()` → `matured` + auto-create
  `token_listings` at target price (idempotent per `holding_id` unique; re-links `listing_id` on replay).
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

## 6. Stages (placeholders — TBD, never invented)

| stage | name | min_buy | max_buy | req 7d | req 14d | upgrade_fee | renewal_fee |
|---|---|---|---|---|---|---|---|
| 1 | Entry | NULL | NULL | 0 | 0 | NULL | NULL |
| 2 | Growth | NULL | NULL | 6 | 3 | NULL | NULL |
| 3 | Advancement | NULL | NULL | 6 | 3 | NULL | NULL |
| 4 | Premium | NULL | NULL | 6 | 3 | NULL | NULL |
| 5 | Elite | NULL | NULL | 6 | 3 | NULL | NULL |

NULL = TBD placeholder: unlimited (limits) / fee_unset (fees).
`POST /api/v1/tokens/stage/request` returns **409 `fee_unset`** when the fee is NULL.

## 7. Commissions / rewards gates (no live enablement)

- 8 `commission_categories` seeded, all `active = false`, `rate_bps = NULL`.
- `commission_rules` seed rows all `active = false`; engine queries `active = true` only → records nothing payable (verified).
- Generation gate: `STAGE_GENS = {1:1, 2:2, 3:3, 4:4, 5:5}`; depth payable only if `depth <= beneficiary stage`.
- Gated calculator `calculateGatedForOrder()` additionally requires the rule's category to be active.
- No live enablement anywhere in this change.
