# COMPLIANCE CHECKLIST — must complete before live money (owner sign-off)

No live payments, crypto settlement, custodial balances, or reward payouts until every box is ticked with evidence.

- [ ] Jurisdiction memo: Nigeria (SEC/AML) + operating entity (MMITPS INC) advice on marketplace + referral compensation. Evidence: counsel letter.
- [ ] Marketplace rules + refund/dispute policy published via CMS (`content_pages`) with version + timestamp.
- [ ] Registration/service fee schedule (amount, currency, services, refund) approved + configured in `service_fees`.
- [ ] Referral program disclosure (basis = verified sales only, levels, rates, confirmation period, caps) published + `commission_rules` v1 activated with budget.
- [ ] Reward campaign funding: documented source + budget + approval (`reward_campaigns.funding_source`, `approved_by/at`). Until then `rewards_payouts=false`.
- [ ] Payment providers: Paystack/Flutterwave/Korapay contracts + live keys + webhook secrets + reconciliation drill. Until then `live_payments=false`.
- [ ] Crypto/USDT: network (BEP20/TRC20) + custody + VASP assessment + ops controls. Until then `crypto_*=false`, routes 403.
- [ ] KYC/verification thresholds + data-retention/privacy workflow tested.
- [ ] Finance dual-approval threshold + payout schedule configured + finance staff MFA enrolled.
- [ ] Backup/restore + rollback drill recorded. Security headers + dep audit clean.

Enforcement: `feature_flags` gate every path above. Bypassing a gate without sign-off is a release-blocker.
