// =====================================================================
// pay2crypto-sandbox.js — *** SIMULATION ONLY. NOT REAL MONEY. ***
//
// In-memory fake of the Pay2Crypto USDT-TRC20 invoice lifecycle for local
// development and hermetic tests:
//
//   createInvoice() -> { payable invoice w/ sandbox address }
//   simulatePay()   -> marks paid, returns webhook payload SIGNED with the
//                      sandbox secret (PAY2CRYPTO_WEBHOOK_SECRET or
//                      'sandbox-secret' fallback for offline tests)
//
// SAFETY: every object this module returns carries `sandbox: true` and a
// `SIMULATION` label. The deposit route refuses to use this module when
// sandbox mode is off (PAY2CRYPTO_SANDBOX=false); live paths go through
// src/lib/pay2crypto.js with real keys + feature-flag gates instead.
// NEVER wire this fake to a live endpoint, and NEVER mark real funds paid
// from a sandbox payload.
// =====================================================================

'use strict';

const crypto = require('crypto');
const { signPayload } = require('./pay2crypto');

const SIMULATION = 'SIMULATION — no real funds move. Sandbox only.';
const SANDBOX_FALLBACK_SECRET = 'sandbox-secret';

function sandboxSecret() {
  return (process.env.PAY2CRYPTO_WEBHOOK_SECRET || '').trim() || SANDBOX_FALLBACK_SECRET;
}

function isSandbox() {
  return (process.env.PAY2CRYPTO_SANDBOX || 'true').toLowerCase() !== 'false';
}

function guardSandbox() {
  if (!isSandbox()) {
    const err = new Error('sandbox_disabled: sandbox fake is never usable when PAY2CRYPTO_SANDBOX=false');
    err.status = 403;
    err.code = 'sandbox_disabled';
    throw err;
  }
}

// Deterministic-ish fake TRC20 address (starts with T, 34 chars, base58).
function fakeTronAddress(seed) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const h = crypto.createHash('sha256').update(String(seed)).digest();
  let s = 'T';
  for (let i = 0; i < 33; i++) s += alphabet[h[i % h.length] % alphabet.length];
  return s;
}

const store = new Map(); // invoiceId -> record (in-memory only; process-local)

function createInvoice({ amountUsdt, orderId }) {
  guardSandbox();
  const network = 'TRC20';
  const invoiceId = `sandbox-inv-${crypto.randomBytes(8).toString('hex')}`;
  const rec = {
    invoiceId,
    orderId: String(orderId),
    amount: String(amountUsdt),
    network,
    payAddress: fakeTronAddress(invoiceId),
    status: 'pending',
    txHash: null,
    sandbox: true,
    label: SIMULATION,
    createdAt: new Date().toISOString(),
  };
  store.set(invoiceId, rec);
  return { ...rec };
}

function getInvoice(invoiceId) {
  guardSandbox();
  const rec = store.get(String(invoiceId));
  if (!rec) {
    const err = new Error('sandbox_invoice_not_found');
    err.status = 404;
    err.code = 'not_found';
    throw err;
  }
  return { ...rec };
}

// Mark the invoice paid in the fake ledger and build a SIGNED webhook payload.
function simulatePay(invoiceId, overrides) {
  guardSandbox();
  const rec = store.get(String(invoiceId));
  if (!rec) {
    const err = new Error('sandbox_invoice_not_found');
    err.status = 404;
    err.code = 'not_found';
    throw err;
  }
  rec.status = 'paid';
  rec.txHash = (overrides && overrides.txHash) || `sandbox-tx-${crypto.randomBytes(16).toString('hex')}`;
  rec.paidAt = new Date().toISOString();
  const payload = {
    event_id: `sandbox-evt-${crypto.randomBytes(8).toString('hex')}`,
    invoice_id: rec.invoiceId,
    order_id: rec.orderId,
    amount: rec.amount,
    currency: 'USDT',
    network: 'TRC20',
    status: 'paid',
    tx_hash: rec.txHash,
    sandbox: true,
    simulation: true,
    timestamp: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(rawBody, sandboxSecret());
  return {
    payload,
    rawBody,
    headers: { 'x-pay2crypto-signature': signature, 'x-timestamp': payload.timestamp },
    sandbox: true,
    label: SIMULATION,
  };
}

// Build the exact webhook POST body/headers a sandbox invoice would deliver.
function webhookFor(invoiceId) {
  return simulatePay(invoiceId);
}

function __clear() {
  store.clear();
}

module.exports = {
  SIMULATION,
  isSandbox,
  sandboxSecret,
  createInvoice,
  getInvoice,
  simulatePay,
  webhookFor,
  fakeTronAddress,
  __clear,
};
