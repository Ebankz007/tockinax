# TRACEABILITY — Business Plan §§1–20 → Modules → Tests

> The approved compensation plan is **recorded** (pricing, stage ranges/fees, referral
> split, registration fee). Every payout path stays **gated**: commission rules and
> categories are `active = false`, live payments are OFF, and payouts require separate
> approval + funding. Insurance is account-level only.

| § | Business-plan item | Module | Test / gate |
|---|---|---|---|
| 1 | Participation token (not an investment) | `token_definitions` TKX, `v1.tokens` purchase, `docs/TOKEN_MODEL.md` | seed kind=STANDARD; label assertion (manual) |
| 2 | 1 TKX = 1 USDT mint basis; off-platform transfers disabled | `tokenPricing.priceSimple`, seed basis | pricing tests 100→104.20/110.50/130.00 |
| 3 | 7-day / 14-day / 30-day lock options | Zod `7\|14\|30`, `pricing_rules` v1 | invalid-lock (45d) test |
| 4 | Simple-interest targets (4.20% / 10.50% / 30.00%) | `src/lib/tokenPricing.js` | simple-not-compound proof + 30d test |
| 5 | Participation cycles (start → mature → settle) | `participation_cycles`, `src/lib/maturity.js` | maturity date math |
| 6 | Cycle success = fully sold + settled | `settleDue()` success flag | `isFillComplete` tests |
| 7 | Market-clearing; unsold stays unsold | `v1.tokenmarket` listings/proceeds | FOR UPDATE + unsold policy (code assertion) |
| 8 | No auto-complete on evidence/screenshot | buy settles ONLY in `POST /listings/:id/buy` | route source: no evidence path |
| 9 | Oversell impossible | `validateBuyQty` + `FOR UPDATE` | oversell guard tests |
| 10 | Stage model Entry→Elite | `stage_definitions`, `GET /stage/me` | seed 1–5 present (migration) |
| 11 | Stage eligible ranges (approved) | S1 50–500 … S5 50,000.01–100,000 | range check in purchase |
| 12 | Stage entry fees (approved) | S1 $20 (registration), S2 $25, S3 $50, S4 $100, S5 $250; `renewal_fee = NULL` → 409 `fee_unset` | fee_unset tests + source assertion |
| 13 | Member numbers TKX-XXXXXXXX | `v1.auth` register + backfill | unique index migration |
| 14 | USDT liability + clearing accounts | `LIAB:sim_usdt`, `SIM:usdt_clearing` seeds (internal ids) | contract codes (payments module reads) |
| 15 | Balanced + idempotent ledger (USDT) | `postBalanced`, 4-leg fill settlement, company settlement | `tests/ledger.test.js` (existing) |
| 16 | Three-generation referrals, stage-gated | `src/lib/commcats.js`, `STAGE_GENS = {1:1,2:2,3:3,4:3,5:3}` | stage-gen map tests |
| 17 | Three referral categories (inactive) + registration split $5/$2/$1/$2/$2/$8 | `commission_categories`, `commission_rules` seeds | all `active=false`, rates recorded |
| 18 | Rewards/commission payouts disabled until approved+funded | active-rule + category-active + funding gates | engine records nothing when inactive |
| 19 | Statements / CSV export | `GET /tokens/statement` | lines shape (manual) |
| 20 | Sweeper automation (mature + settle, keep existing) | `src/workers/sweeper.cjs` | `--once` includes tokenMatured/tokenSettled |

## Account-level insurance (not per token)

| Item | Module | Gate |
|---|---|---|
| Activation/status | `POST /auth/insurance/activate`, `GET /auth/insurance/status` | account membership only |
| Purchase gate | `POST /tokens/purchase` → 403 `insurance_not_active` | account must be insured |
| Per-token purchase retired | `POST /insurance/purchase` → 410 `account_level_insurance_only` | no token/lock attachment |
| Claims | `insurance_claims` (nullable `policy_id`) reviewed by super_admin | manual approval before payout |

## Legal gates (must ALL pass before any live enablement)

1. Legal opinion: participation record is not a security / not a deposit product.
2. Finance: documented funding source + budget caps + dual approval.
3. Ops: provider, network, and payout rails approved (`live_payments`, `rewards_payouts`, `crypto_*` flags).
4. Admin: explicit activation of rules/categories/fees (no NULL→value without disclosure + audit).

No live enablement is included in this change set.
