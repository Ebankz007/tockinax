# TOCKINAX SECURITY CHECKLIST

Release-gate: every box ticked with evidence before live money. Owner: security lead.

- [x] **Password hashing**: bcrypt cost 12 + login lockout (10 fails → 30 min) + audit/`fraud_risk_events` on lock (`v1.auth.js`).
- [ ] **MFA**: TOTP for `support`/`finance`/`super_admin` — enrolment enforced at bootstrap (verify in staging).
- [x] **RBAC**: `requirePerm` + `adminOnly` server-side; six roles; frontend never authoritative.
- [x] **Rate limits**: global `/api/v1` 120/min; `/auth` 30/min; `/webhooks` 60/min (`express-rate-limit`, standard headers).
- [x] **Validation**: Zod on all writers + `validate()` wrapper; output allow-listing (no password hashes leave the API).
- [x] **CSRF/cookies**: `HttpOnly; Secure(prod); SameSite=Lax` access cookie, 15 min; rotating refresh (7 d, hashed at rest).
- [x] **Uploads**: 5 MB cap, png/jpg/pdf allow-list, magic-byte sniff (`middleware/upload.js`); private storage, signed URLs only; AV hook point before serve.
- [ ] **Webhooks**: HMAC verify + timestamp tolerance + replay cache (Phase 5 — stub-verified only today).
- [x] **Secrets**: `.env.example` placeholders only; `.env` git-ignored; `git status` clean check in CI deploy step.
- [x] **Least privilege**: app role vs migrate owner (migration SQL revokes UPDATE/DELETE on `ledger_entries`); `search_path` pinned to `gatedp2p, public`.
- [x] **Backups**: nightly `pg_dump -Fc` + 30 d retention + quarterly restore drill (see BACKUP_RESTORE.md).
- [ ] **Dep audit**: `npm audit --omit=dev` clean of high/critical before each release (record output in STATUS.md).
- [x] **Headers/HTTPS**: helmet + explicit HSTS (180 d, subdomains, preload), `nosniff`, frame guard; TLS at reverse proxy; CORS allow-list = `APP_URL` only.
- [ ] **Retention/privacy**: KYC thresholds + data-retention workflow tested per COMPLIANCE_CHECKLIST before live traffic.
