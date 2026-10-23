// Deposit intents (USDT TRC20 via Pay2Crypto) — auth required.
//
// CONTRACT (shared with token module): member SIM-USDT balance lives in
// ledger account `LIAB:sim_usdt` (LIABILITY, USDT); clearing account
// `SIM:usdt_clearing` (ASSET, USDT). A verified deposit CREDITS the member
// balance: DEBIT SIM:usdt_clearing / CREDIT LIAB:sim_usdt (balanced USDT
// legs, idempotent per intent). Purchases spend it elsewhere (token module).
//
// SANDBOX-FIRST: invoice creation uses the in-memory sandbox fake by default
// (PAY2CRYPTO_SANDBOX != 'false'). A live Pay2Crypto invoice is created ONLY
// when BOTH hold: feature flag `live_payments` is ON *and*
// PAY2CRYPTO_API_TOKEN is set. Otherwise an explicit live request gets
// 409 live_disabled. No live money movement without keys + flag.
//
// NOTE: the inbound webhook handler lives in src/routes/v1.pay2crypto-webhook.js.
// The credit-on-confirm helper below (confirmDepositIntent) is shared with it.

'use strict';

const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { postBalanced, Decimal } = require('../lib/ledger');
const live = require('../lib/pay2crypto');
const sandbox = require('../lib/pay2crypto-sandbox');

const router = express.Router();
router.use(authRequired);

const PURPOSES = ['registration_fee', 'token_purchase', 'stage_upgrade', 'stage_renewal'];
const NETWORK_DISPLAY = 'USDT — TRON/TRC20 ONLY';

function isSandboxMode() {
  return (process.env.PAY2CRYPTO_SANDBOX || 'true').toLowerCase() !== 'false';
}

async function livePaymentsOn(pool) {
  try {
    const r = await (pool || getPool()).query(`select enabled from feature_flags where key = 'live_payments'`);
    return r.rowCount ? !!r.rows[0].enabled : false;
  } catch {
    return false;
  }
}

// Pure validation shared with hermetic tests.
function validateIntentInput(body) {
  const b = z.object({
    purpose: z.enum(PURPOSES),
    amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
    network: z.string().default('TRC20'),
    idempotencyKey: z.string().min(8).max(96).optional(),
  }).parse(body);
  const network = live.assertNetwork(b.network); // throws 400 unsupported_network
  const amt = new Decimal(b.amount);
  if (amt.lte(0)) {
    const err = new Error('invalid_amount');
    err.status = 400;
    throw err;
  }
  return { purpose: b.purpose, amount: amt.toFixed(4), network, idempotencyKey: b.idempotencyKey || null };
}

// Credit a confirmed intent: DEBIT clearing / CREDIT member LIAB:sim_usdt.
// Idempotent per intent (ledger idempotency key `sim:funding:<intentId>`);
// replay returns { replayed:true } without double-posting.
async function confirmDepositIntent(pool, intent, txHash) {
  const amount = new Decimal(intent.amount).toFixed(4);
  const res = await postBalanced({
    sourceType: 'sim_funding', // NOTE: token module simBalance() sums THIS source_type per user
    sourceId: intent.user_id,
    currency: 'USDT',
    memo: `pay2crypto deposit ${intent.id} invoice ${intent.provider_invoice_id || ''}`.slice(0, 200),
    idempotencyKey: `sim:funding:${intent.id}`,
    lines: [
      { account: 'SIM:usdt_clearing', debit: amount },
      { account: 'LIAB:sim_usdt', credit: amount },
    ],
  });
  await pool.query(
    `update deposit_intents set status='confirmed', tx_hash=coalesce($1, tx_hash), updated_at=now() where id=$2`,
    [txHash || null, intent.id]
  );
  return res;
}

// POST /deposits/intent — create intent + invoice, return pay instructions.
router.post('/intent', async (req, res, next) => {
  try {
    let v;
    try {
      v = validateIntentInput(req.body);
    } catch (e) {
      if (e.code === 'unsupported_network') return res.status(400).json({ error: 'unsupported_network', message: e.message });
      throw e;
    }
    const pool = getPool();
    const sandboxMode = isSandboxMode();
    let liveOn = false;
    if (!sandboxMode) {
      liveOn = await livePaymentsOn(pool);
      const token = (process.env.PAY2CRYPTO_API_TOKEN || '').trim();
      // Live path stays OFF unless flag + keys are both present.
      if (!liveOn || !token) {
        return res.status(409).json({
          error: 'live_disabled',
          message: 'Live Pay2Crypto invoicing is disabled (needs live_payments flag + PAY2CRYPTO_API_TOKEN + legal/settlement approval).',
        });
      }
    }

    const idem = v.idempotencyKey || `dep:${req.user.id}:${v.purpose}:${v.amount}:${crypto.randomBytes(8).toString('hex')}`;
    const dupe = await pool.query(`select * from deposit_intents where idempotency=$1`, [idem]);
    if (dupe.rowCount) return res.status(200).json({ replayed: true, intent: dupe.rows[0] });

    const ins = await pool.query(
      `insert into deposit_intents (user_id, purpose, amount, currency, network, provider, status, sandbox, idempotency)
       values ($1,$2,$3,'USDT',$4,'pay2crypto','created',$5,$6) returning *`,
      [req.user.id, v.purpose, v.amount, v.network, sandboxMode, idem]
    );
    const intent = ins.rows[0];

    let invoice;
    try {
      if (sandboxMode) {
        const s = sandbox.createInvoice({ amountUsdt: v.amount, orderId: intent.id });
        invoice = { invoiceId: s.invoiceId, payAddress: s.payAddress };
      } else {
        const inv = await live.createInvoice({ amountUsdt: v.amount, orderId: intent.id, network: v.network });
        invoice = { invoiceId: inv.invoiceId, payAddress: inv.payAddress };
      }
    } catch (e) {
      await pool.query(`update deposit_intents set status='failed', updated_at=now() where id=$1`, [intent.id]);
      throw e;
    }

    await pool.query(
      `update deposit_intents set provider_invoice_id=$1, pay_address=$2, status='pending', updated_at=now() where id=$3`,
      [invoice.invoiceId, invoice.payAddress, intent.id]
    );
    const updated = await pool.query(`select * from deposit_intents where id=$1`, [intent.id]);
    res.status(201).json({
      intent: updated.rows[0],
      pay: {
        address: invoice.payAddress,
        qrPayload: invoice.payAddress ? `tron:${invoice.payAddress}?amount=${v.amount}&asset=USDT` : null,
        amount: v.amount,
        currency: 'USDT',
        network: 'TRC20',
        networkDisplay: NETWORK_DISPLAY,
      },
      sandbox: sandboxMode,
    });
  } catch (e) {
    next(e);
  }
});

// GET /deposits/intents/mine
router.get('/intents/mine', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select * from deposit_intents where user_id=$1 order by created_at desc limit 50`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

// GET /deposits/intents/:id/status
router.get('/intents/:id/status', async (req, res, next) => {
  try {
    const r = await getPool().query(`select * from deposit_intents where id=$1 and user_id=$2`, [
      req.params.id,
      req.user.id,
    ]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.validateIntentInput = validateIntentInput;
module.exports.confirmDepositIntent = confirmDepositIntent;
module.exports.NETWORK_DISPLAY = NETWORK_DISPLAY;
module.exports.isSandboxMode = isSandboxMode;
module.exports.livePaymentsOn = livePaymentsOn;
