// Pay2Crypto inbound webhook — NO auth (provider-signed), rate-limited at mount.
//
// Flow: signature verify (HMAC-SHA256 default) -> dedupe via
// payment_provider_events(provider='pay2crypto', event_id UNIQUE) -> load
// intent by provider_invoice_id -> confirm (credit) / expire / fail -> audit.
//
// SAFETY:
// - Never 500 on a bad signature: 400 + log, no state change.
// - Live mode re-fetches the invoice from the Pay2Crypto API before crediting
//   (never trust the callback amount alone); sandbox mode trusts the signed
//   sandbox payload (SIMULATION only).
// - Amount mismatch -> intent failed + fraud_risk_events row, NO credit.
// - Duplicate deliveries -> { duplicate:true } with no double credit (ledger
//   idempotency key is per-intent, so even a race replays safely).
//
// NOTE: app.js mounts express.json() globally, so the "raw body" here is the
// canonical JSON.stringify(req.body) — same convention as v1.webhooks.js.
// ADAPTER MAP [2] (see src/lib/pay2crypto.js) must be verified before live use.

'use strict';

const express = require('express');
const { getPool } = require('../lib/db');
const { postBalanced, Decimal } = require('../lib/ledger');
const p2c = require('../lib/pay2crypto');
const { confirmDepositIntent } = require('./v1.deposits');

const router = express.Router();

function isSandboxMode() {
  return (process.env.PAY2CRYPTO_SANDBOX || 'true').toLowerCase() !== 'false';
}

// Dedupe insert. Injectable db handle keeps this unit-testable (hermetic).
// Returns { duplicate:boolean }.
async function recordProviderEvent(db, eventId, payload, signatureOk) {
  try {
    const r = await db.query(
      `insert into payment_provider_events (provider, event_id, payload, signature_ok)
       values ('pay2crypto',$1,$2,$3) on conflict (provider, event_id) do nothing returning id`,
      [eventId, payload, signatureOk]
    );
    return { duplicate: r.rowCount === 0 };
  } catch (e) {
    if (/duplicate|unique/i.test(e.message)) return { duplicate: true };
    throw e;
  }
}

async function audit(pool, actorId, ip, action, targetId, diff) {
  try {
    await pool.query(
      `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
       values ($1,$2,$3,$4,$5,$6)`,
      [actorId || null, action, 'deposit_intent', String(targetId), diff || {}, ip || null]
    );
  } catch {
    /* audit must never break the webhook response */
  }
}

// POST /pay2crypto (mounted under /api/v1/pay2crypto-webhook by owner)
router.post('/pay2crypto', async (req, res, next) => {
  try {
    const pool = getPool();
    const raw = JSON.stringify(req.body || {});
    const v = p2c.verifyWebhook(raw, req.headers || {});

    // Bad signature / stale / malformed -> 400 + log. NEVER 500, never credit.
    if (!v.ok) {
      console.warn('[pay2crypto-webhook] rejected:', v.reason);
      return res.status(400).json({ error: 'bad_signature', reason: v.reason });
    }

    // Dedupe BEFORE any state change.
    const seen = await recordProviderEvent(pool, v.eventId, req.body || {}, true);
    if (seen.duplicate) return res.json({ ok: true, duplicate: true });

    if (!v.invoiceId) {
      console.warn('[pay2crypto-webhook] no invoice id in event', v.eventId);
      return res.status(404).json({ error: 'intent_not_found' });
    }

    // Look up the invoice across all payment intent tables.
    let intent = null;
    let intentType = null; // 'deposit' | 'activation' | 'upgrade'

    const d = await pool.query(`select * from deposit_intents where provider_invoice_id=$1`, [v.invoiceId]);
    if (d.rowCount) { intent = d.rows[0]; intentType = 'deposit'; }
    else {
      const a = await pool.query(`select * from activation_payments where provider_invoice_id=$1`, [v.invoiceId]);
      if (a.rowCount) { intent = a.rows[0]; intentType = 'activation'; }
      else {
        const u = await pool.query(`select * from upgrade_payments where provider_invoice_id=$1`, [v.invoiceId]);
        if (u.rowCount) { intent = u.rows[0]; intentType = 'upgrade'; }
      }
    }

    if (!intent) {
      console.warn('[pay2crypto-webhook] unknown invoice', v.invoiceId);
      return res.status(404).json({ error: 'intent_not_found' });
    }
    if (intent.status === 'confirmed') {
      await pool.query(
        `update payment_provider_events set processed_at=now() where provider='pay2crypto' and event_id=$1`,
        [v.eventId]
      ).catch(() => {});
      return res.json({ ok: true, duplicate: true, status: 'confirmed', type: intentType });
    }

    // Determine authoritative status/amount. Live: re-fetch from API first.
    let status = (v.status || '').toLowerCase();
    let amount = v.amount;
    let txHash = v.txHash;
    if (!isSandboxMode()) {
      try {
        const inv = await p2c.getInvoice(v.invoiceId);
        status = String(inv.status || status).toLowerCase();
        if (inv.amount != null) amount = inv.amount;
        if (inv.txHash) txHash = inv.txHash;
      } catch (e) {
        console.error('[pay2crypto-webhook] live re-fetch failed:', e.message);
        return res.status(502).json({ error: 'verify_failed', message: 'Could not re-verify invoice with provider.' });
      }
    } else if (intent.sandbox !== true && intent.sandbox !== 1 && intent.sandbox !== 't') {
      // Sandbox-signed callback for a live intent: refuse to credit.
      await pool.query(`update ${intentType === 'deposit' ? 'deposit_intents' : intentType === 'activation' ? 'activation_payments' : 'upgrade_payments'} set status='failed', updated_at=now() where id=$1`, [intent.id]);
      await pool.query(
        `insert into fraud_risk_events (kind, user_id, detail) values ('sandbox_callback_for_live_intent',$1,$2)`,
        [intent.user_id, { intent_id: intent.id, event_id: v.eventId }]
      );
      await audit(pool, null, req.ip, `${intentType}.sandbox_for_live`, intent.id, { eventId: v.eventId });
      return res.status(409).json({ error: 'sandbox_live_mismatch' });
    }

    if (p2c.isPaidStatus(status) || (!status && txHash)) {
      // Amount guard: provider amount must equal intent amount exactly.
      if (amount != null) {
        const got = new Decimal(String(amount));
        const want = new Decimal(intent.amount);
        if (!got.equals(want)) {
          await pool.query(`update ${intentType === 'deposit' ? 'deposit_intents' : intentType === 'activation' ? 'activation_payments' : 'upgrade_payments'} set status='failed', tx_hash=$1, updated_at=now() where id=$2`, [
            txHash || null,
            intent.id,
          ]);
          await pool.query(
            `insert into fraud_risk_events (kind, user_id, detail) values ('${intentType}_amount_mismatch',$1,$2)`,
            [intent.user_id, { intent_id: intent.id, expected: want.toString(), received: got.toString(), event_id: v.eventId }]
          );
          await audit(pool, null, req.ip, `${intentType}.amount_mismatch`, intent.id, { expected: want.toString(), received: got.toString() });
          return res.status(200).json({ ok: true, status: 'failed', reason: 'amount_mismatch' });
        }
      }

      if (intentType === 'deposit') {
        try {
          const posted = await confirmDepositIntent(pool, intent, txHash);
          await pool.query(
            `update payment_provider_events set processed_at=now() where provider='pay2crypto' and event_id=$1`,
            [v.eventId]
          ).catch(() => {});
          await audit(pool, null, req.ip, 'deposit.confirmed', intent.id, {
            eventId: v.eventId,
            txHash: txHash || null,
            replayed: posted.replayed,
            sandbox: !!intent.sandbox,
          });
          return res.json({ ok: true, status: 'confirmed', replayed: posted.replayed, sandbox: !!intent.sandbox, type: 'deposit' });
        } catch (e) {
          console.error('[pay2crypto-webhook] ledger failed:', e.message);
          return res.status(502).json({ error: 'ledger_error', message: e.message });
        }
      }

      // Activation payment: confirm + activate user account.
      if (intentType === 'activation') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`update activation_payments set status='confirmed', tx_hash=coalesce($1, tx_hash), confirmed_at=now(), updated_at=now() where id=$2`, [txHash || null, intent.id]);
          await client.query(`update users set status='active', updated_at=now() where id=$1 and status='pending_verification'`, [intent.user_id]);
          await client.query(
            `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
             values (null,'activation.payment_confirmed','user',$1,$2,$3)`,
            [intent.id, { txHash: txHash || null, sandbox: !!intent.sandbox }, req.ip]
          );
          await client.query(`update payment_provider_events set processed_at=now() where provider='pay2crypto' and event_id=$1`, [v.eventId]).catch(() => {});
          await client.query('COMMIT');
          return res.json({ ok: true, status: 'confirmed', type: 'activation', userId: intent.user_id, sandbox: !!intent.sandbox });
        } catch (e) {
          try { await client.query('ROLLBACK'); } catch {}
          console.error('[pay2crypto-webhook] activation confirm failed:', e.message);
          return res.status(502).json({ error: 'ledger_error', message: e.message });
        } finally { client.release(); }
      }

      // Upgrade payment: confirm + apply stage upgrade.
      if (intentType === 'upgrade') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`update upgrade_payments set status='confirmed', tx_hash=coalesce($1, tx_hash), confirmed_at=now(), updated_at=now() where id=$2`, [txHash || null, intent.id]);
          await client.query(`update users set stage=$2, updated_at=now() where id=$1`, [intent.user_id, intent.to_stage]);
          await client.query(
            `insert into stage_history (user_id, from_stage, to_stage, kind, created_by)
             values ($1,$2,$3,'upgrade',$1)`,
            [intent.user_id, intent.from_stage, intent.to_stage]
          );
          await client.query(
            `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
             values (null,'upgrade.payment_confirmed','user',$1,$2,$3)`,
            [intent.id, { fromStage: intent.from_stage, toStage: intent.to_stage, txHash: txHash || null, sandbox: !!intent.sandbox }, req.ip]
          );
          await client.query(`update payment_provider_events set processed_at=now() where provider='pay2crypto' and event_id=$1`, [v.eventId]).catch(() => {});
          await client.query('COMMIT');
          return res.json({ ok: true, status: 'confirmed', type: 'upgrade', userId: intent.user_id, fromStage: intent.from_stage, toStage: intent.to_stage, sandbox: !!intent.sandbox });
        } catch (e) {
          try { await client.query('ROLLBACK'); } catch {}
          console.error('[pay2crypto-webhook] upgrade confirm failed:', e.message);
          return res.status(502).json({ error: 'ledger_error', message: e.message });
        } finally { client.release(); }
      }

      // Should not reach here (only deposit/activation/upgrade exist).
      return res.status(500).json({ error: 'unknown_intent_type' });
    }

    if (p2c.isFailedStatus(status)) {
      await pool.query(`update ${intentType === 'deposit' ? 'deposit_intents' : intentType === 'activation' ? 'activation_payments' : 'upgrade_payments'} set status=$1, updated_at=now() where id=$2`, [status, intent.id]);
      await audit(pool, null, req.ip, `${intentType}.terminal`, intent.id, { status, eventId: v.eventId });
      return res.json({ ok: true, status, type: intentType });
    }

    // Pending/confirming: record intent state, wait for the paid callback.
    if (intent.status !== 'pending' || !intent.tx_hash) {
      await pool.query(`update ${intentType === 'deposit' ? 'deposit_intents' : intentType === 'activation' ? 'activation_payments' : 'upgrade_payments'} set status='pending', updated_at=now() where id=$1`, [intent.id]);
    }
    return res.json({ ok: true, status: 'pending', type: intentType });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.recordProviderEvent = recordProviderEvent;
