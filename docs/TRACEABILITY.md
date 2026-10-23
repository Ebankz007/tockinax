# TRACEABILITY — Business Plan §§1–20 → Modules → Tests

> Compensation numbers are **TBD placeholders** (NULL / inactive) until legal, finance,
> and ops approvals land. Nothing in this pilot enables live payouts.

| § | Business-plan item | Module | Test / gate |
|---|---|---|---|
| 1 | Simulated participation token (not an investment) | `token_definitions` TKX-SIM, `v1.tokens` purchase, `docs/TOKEN_MODEL.md` | seed kind=SIMULATED; label assertion (manual) |
| 2 | 1 TKX = 1 USDT mint basis; off-platform transfers disabled | `tokenPricing.priceSimple`, seed basis | pricing tests 100→107/114 |
| 3 | 7-day / 14-day lock options | Zod `7\|14`, `pricing_rules` v1 | invalid-lock test |
| 4 | Simple-interest targets (7% / 14%) | `src/lib/tokenPricing.js` | simple-not-compound proof |
| 5 | Participation cycles (start → mature → settle) | `participation_cycles`, `src/lib/maturity.js` | maturity date math |
| 6 | Cycle success = fully sold + settled | `settleDue()` success flag | `isFillComplete` tests |
| 7 | Market-clearing; unsold stays unsold | `v1.tokenmarket` listings/proceeds | FOR UPDATE + unsold policy (code assertion) |
| 8 | No auto-complete on evidence/screenshot | buy settles ONLY in `POST /listings/:id/buy` | route source: no evidence path |
| 9 | Oversell impossible | `validateBuyQty` + `FOR UPDATE` | oversell guard tests |
| 10 | Stage model Entry→Elite | `stage_definitions`, `GET /stage/me` | seed 1–5 present (migration) |
| 11 | Stage buy limits (TBD) | NULL = unlimited check in purchase | code: NULL passes |
| 12 | Upgrade / renewal fees (TBD) | `POST /stage/request` 409 `fee_unset` | fee_unset tests + source assertion |
| 13 | Member numbers TKX-XXXXXXXX | `v1.auth` register + backfill | unique index migration |
| 14 | SIM-USDT liability + clearing accounts | `LIAB:sim_usdt`, `SIM:usdt_clearing` seeds | contract codes (payments module reads) |
| 15 | Balanced + idempotent ledger (USDT) | `postBalanced`, 4-leg fill settlement | `tests/ledger.test.js` (existing) |
| 16 | Generation-gated recognition (TBD, inactive) | `src/lib/commcats.js`, `STAGE_GENS` | stage-gen map tests |
| 17 | 8 proposed commission categories (inactive) | `commission_categories` seeds | all `active=false`, rates NULL |
| 18 | Rewards/commission payouts disabled until approved+funded | active-rule + category-active + funding gates | engine records nothing when inactive |
| 19 | Statements / CSV export | `GET /tokens/statement` | lines shape (manual) |
| 20 | Sweeper automation (mature + settle, keep existing) | `src/workers/sweeper.cjs` | `--once` includes tokenMatured/tokenSettled |

## Legal gates (must ALL pass before any live enablement)

1. Legal opinion: simulated record is not a security / not a deposit product.
2. Finance: documented funding source + budget caps + dual approval.
3. Ops: provider, network, and payout rails approved (`live_payments`, `rewards_payouts`, `crypto_*` flags).
4. Admin: explicit activation of rules/categories/fees (no NULL→value without disclosure + audit).

No live enablement is included in this change set.
