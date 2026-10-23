# TOCKINAX — Commercial gate proposal (SIGN-OFF DOC — nothing here is applied)

Status: **PROPOSAL ONLY.** Code defaults stay OFF/0/DRAFT until Henry signs each row
with a date + initials. Flipping without a signature is a process violation, not a deploy.

Pricing logic: fees must be paid by real trade spread, rewards by documented company
money — never by new inflow. If a gate cannot name its funding source, it stays shut.

## The 8 gates (in recommended opening order)

| # | Gate | Proposal | Exact flip (approver) | Cost if wrong |
|---|------|----------|----------------------|---------------|
| 1 | Registration fee | **₦0 / $0 until 500 active traders**, then review. Funnel friction + refund-support cost exceeds fee revenue at seed stage. Email-verify + rate-limit + suspend already handle spam. | `update service_fees set amount=0 ...` + refund policy date (Henry) | Spam wave → mitigate with suspend + CAPTCHA; revisit at 500 |
| 2 | Platform fee | **Keep 1%** (already in code), uncapped pilot, review at $10k settled volume (~$100 revenue). | Code constant → `system_settings` when configurable (Henry + finance) | Too high kills liquidity; too low starves ops — 1% is the reversible middle |
| 3 | Payout minimums + dual approval | **Min $10 / ₦5,000 equiv; dual approval above ₦500k** (current defaults). Keeps finance queue sane. | `system_settings payout_policy` (finance ×2 signatures above threshold) | Dust-request spam vs. member anger — minimums are the cheapest spam filter |
| 4 | Referral commissions L1 5% / L2 3% / L3 2% | **Stay INACTIVE until (a) 100 verified completed sales AND (b) $1,000 pilot budget is allocated from documented OPS funds.** Basis locked `eligible_verified_sales`, 7-day confirmation, budget-capped, versioned. Math at $20 avg order: L1=$1.00, L2=$0.60, L3=$0.40 → 100 pilot sales ≈ $200 liability, 5× covered by budget. L4/L5 stay disabled. | `update commission_rules set active=true, budget_cap=1000 where version=<signed>` + funding memo (Henry + finance) | MLM perception / liability spiral → mitigations: no recruitment pay, caps, idempotency, reversals on refund |
| 5 | Stage A (3%) / Stage B (7%) rewards | **DO NOT approve until 90 days of marketplace-fee revenue covers the proposed budget 3× (self-funding rule).** Suggested pilot budgets for scale only: A $300, B $500 — Henry sets finals. Never returns on deposits; copy already says so. | `POST /api/v1/admin/campaigns/:id/approve {fundingSource, budgetCap}` (Henry + finance + legal) | Fake-yield perception → the 3× rule makes rewards a profit-share, not a promise |
| 6 | Live fiat payments (Paystack/Flutterwave) | **After provider approval + webhook secret + COMPLIANCE checklist.** Until then stub-verify (`live:false`). | Set keys + `live_payments` flag (Henry + legal + finance) | Chargeback/fraud liability lands on you — no keys, no live money |
| 7 | USDT payouts (BEP20/TRC20) | **Stay 403 until written legal opinion + ONE network chosen.** Recommend single-network pilot (BEP20: low fees, broad wallet support) to halve ops surface — TRC20 later only on demand. Never store keys/seeds. | `crypto_payouts` flag + network config (Henry + legal + ops) | Two-network ops + sanctions/KYC exposure — one network or none |
| 8 | FX display | **Manual weekly update by named owner** until provider. Display-only, "indicative" label stays. | `fx_rates` insert duty roster (ops) | Stale-rate disputes — weekly cadence bounds the drift |

## Premortem (the disaster we're designing against)

"It's March. Commissions went live before 100 sales, a Stage B campaign launched on
borrowed framing, inflow slowed one weekend, the queue screamed Ponzi, and MMITPS is
answering the SEC." Every control above (budget caps, 3× rule, 100-sale gate, dual
approval, 403s) exists to make that sentence un-writable.

## Sign-off (fill before any flip)

- [ ] Gate 1 fee ......................................................... initials/date
- [ ] Gate 2 platform fee .............................................. initials/date
- [ ] Gate 3 payout policy ............................................ initials/date
- [ ] Gate 4 commissions (version + budget + funding memo) ............. initials/date
- [ ] Gate 5 campaigns (budget + funding + legal) ...................... initials/date
- [ ] Gate 6 fiat provider (keys + compliance) ......................... initials/date
- [ ] Gate 7 crypto (legal opinion + network) .......................... initials/date
- [ ] Gate 8 FX owner .................................................. initials/date

Flip order: 1 → 2 → 3 (day one, zero liability) → 8 (ops hygiene) → 6 (real volume) →
4 (only on profit) → 5 (only on 3× profit) → 7 (last, if ever).
