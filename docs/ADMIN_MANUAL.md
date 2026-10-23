# TOCKINAX ADMIN MANUAL

Roles: `visitor` → `member` → `seller` (flag `users.seller_enabled`) → `support` →
`finance` → `super_admin`. All checks are server-side (`requirePerm` / `adminOnly`);
frontend flags are cosmetic. Every admin/finance mutation writes `audit_logs`.

## 1. Seller enable

1. Verify identity (`identity_checks` kind `kyc` → `passed`).
2. `UPDATE users SET seller_enabled=true WHERE id=…` (or admin UI when shipped).
3. Confirm via `GET /admin/overview` member counts. Revoke by setting false —
   existing `active` listings should then be `suspended` (listing moderation below).

## 2. Listing moderation

`POST /api/v1/admin/listings/:id/decision { decision: active|suspended|removed, reason? }`
- New listings land `pending_review`. `active` = visible in marketplace search.
- `suspended`/`removed` hide immediately. Reason is stored in the audit diff.
- Audit review: `SELECT * FROM audit_logs WHERE action='listing.decision' ORDER BY created_at DESC`.

## 3. Order confirm (dual path — screenshot ≠ proof)

Orders: `draft → pending_payment → evidence_submitted → under_review → completed|disputed`.
- Buyer evidence only moves to `evidence_submitted` (PENDING review).
- `POST /api/v1/admin/orders/:id/confirm { confirm:true }` → `completed` + books the
  1% platform fee via balanced ledger (`fee:<orderId>`, idempotent replay safe).
- `{ confirm:false }` → `disputed` for the dispute workflow (Phase 3).
- Guard: only `evidence_submitted`/`under_review` orders confirmable, else `409 bad_state`.
- Signed provider webhooks (Phase 5) are the other completion path — either path suffices, neither is automatic.

## 4. Payout dual approval (over threshold)

- Threshold: `PAYOUT_DUAL_APPROVAL_THRESHOLD_NGN` (default 500 000).
- Requests start `requested`. Over-threshold payouts require **two distinct**
  approvers (`approved_by`, `second_approved_by`) before `processing`.
- Eligibility is computed, never claimed: confirmed-`payable` commission/reward
  calcs minus already-requested/paid. Over-claims get `422 insufficient_eligible`.
- Never accept `privateKey`/`seed`/`mnemonic` in destinations (`400 never_share_keys`).

## 5. Campaign approve (funding + budget required)

`POST /api/v1/admin/campaigns/:id/approve { fundingSource≥10 chars, budgetCap:"N.NNNN" }`
- Moves `draft → scheduled` only when **both** funding source and budget cap are set,
  plus `approved_by/at`. Until then claims return `409 rewards_disabled`.
- Disclose: rates are activity incentives, NOT returns on deposits.

## 6. Audit log review (daily for finance, weekly otherwise)

```sql
SELECT actor_id, action, target_type, target_id, ip, created_at
FROM audit_logs ORDER BY created_at DESC LIMIT 100;
SELECT kind, user_id, detail, created_at
FROM fraud_risk_events ORDER BY created_at DESC LIMIT 100;  -- login_lockout, etc.
```

## 7. Suspend / reactivate

- Suspend: `UPDATE users SET status='suspended' …` — `authRequired` then returns
  `401 account_blocked`; sessions should be revoked (`user_sessions.revoked_at=now()`).
- Reactivate: `status='active'` after review; record reason in `audit_logs`.
- Bans (`status='banned'`) are permanent absent super-admin reversal + counsel note.
