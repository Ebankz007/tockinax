// Pay2Crypto REST client (live path) — CommonJS, no new deps (global fetch).
//
// Research basis (2026-10): Pay2Crypto is a NON-CUSTODIAL USDT gateway that
// settles straight to the merchant wallet. Currently USDT TRC20 ONLY
// (payment_type=1, payment_network=1/Tron). REST base
// https://api.pay2crypto.com/v1/, POST /v1/invoices/create, scoped API
// tokens, webhook payment notifications carrying the tx hash, sandbox env
// exists. Webfetch of https://documentation.pay2crypto.com/ FAILED at build
// time, so every provider-specific wire assumption below is quarantined in
// the ADAPTER MAP and must be re-verified before ANY live use.

'use strict';

const crypto = require('crypto');

/* =====================================================================
 * ADAPTER MAP — VERIFY-WITH-DOCS BEFORE LIVE USE. DO NOT ASSUME.
 *
 * [1] AUTH HEADER SCHEME ......... default: `Bearer <PAY2CRYPTO_API_TOKEN>`.
 *     VERIFY-WITH-DOCS: exact scheme (Bearer vs `Token` vs `X-API-Key`).
 * [2] WEBHOOK SIGNATURE .......... default: HMAC-SHA256 over the RAW request
 *     body bytes, hex digest, compared (timing-safe) against header
 *     `x-pay2crypto-signature` (also accepts `x-signature`). Timestamp replay
 *     window: 5 minutes via `timestamp` body field or `x-timestamp` header.
 *     VERIFY-WITH-DOCS: algorithm (SHA256 vs SHA512), signed payload layout
 *     (raw body vs canonical JSON vs field concat), header name, timestamp
 *     field name + tolerance.
 * [3] SANDBOX BASE URL ........... default: same as live base
 *     (https://api.pay2crypto.com/v1/) unless PAY2CRYPTO_BASE_URL override.
 *     VERIFY-WITH-DOCS: dedicated sandbox host/path, if any.
 * [4] INVOICE STATUS VALUES ...... default accepted paid values:
 *     ['paid', 'confirmed', 'completed', 'success']; pending values:
 *     ['created', 'pending', 'confirming', 'wait_payment', 'partial'];
 *     terminal-fail values: ['failed', 'expired', 'cancelled'].
 *     VERIFY-WITH-DOCS: exact status vocabulary + transition diagram.
 * [5] INVOICE CREATE BODY ........ default: { amount, order_id,
 *     payment_type: 1 (USDT), payment_network: 1 (Tron/TRC20),
 *     currency: 'USDT' }. VERIFY-WITH-DOCS: exact field names, whether
 *     amount is major units or smallest units, extra required fields
 *     (callback_url, settlement address echo, etc.).
 * [6] WEBHOOK EVENT FIELDS ....... default extraction tries
 *     body.{event_id|id}, body.{invoice_id|invoiceId|order_id|orderId},
 *     body.{tx_hash|txHash|hash}, body.{amount|value}, body.{status|state}.
 *     VERIFY-WITH-DOCS: canonical field layout.
 * ==================================================================== */

const ADAPTER_MAP = {
  authHeaderScheme: 'VERIFY-WITH-DOCS: default `Bearer <token>`',
  webhookSignature: 'VERIFY-WITH-DOCS: default HMAC-SHA256(rawBody) vs x-pay2crypto-signature, 5min tolerance',
  sandboxBaseUrl: 'VERIFY-WITH-DOCS: defaults to live base; override via PAY2CRYPTO_BASE_URL',
  invoiceStatuses: 'VERIFY-WITH-DOCS: paid=[paid|confirmed|completed|success]; fail=[failed|expired|cancelled]',
  invoiceCreateBody: 'VERIFY-WITH-DOCS: default {amount, order_id, payment_type:1, payment_network:1, currency:USDT}',
  webhookFields: 'VERIFY-WITH-DOCS: default event_id/invoice_id/tx_hash/amount/status aliases',
};

const DEFAULT_BASE_URL = 'https://api.pay2crypto.com/v1/';
const SUPPORTED_NETWORKS = ['TRC20']; // USDT TRC20 ONLY — anything else throws unsupported_network
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

function baseUrl() {
  const u = (process.env.PAY2CRYPTO_BASE_URL || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  return u.endsWith('/') ? u : `${u}/`;
}

function apiToken() {
  return (process.env.PAY2CRYPTO_API_TOKEN || '').trim();
}

function webhookSecret() {
  return (process.env.PAY2CRYPTO_WEBHOOK_SECRET || '').trim();
}

// Throws { code:'unsupported_network' } for anything but TRC20. Case-insensitive.
function assertNetwork(network) {
  const n = String(network || 'TRC20').toUpperCase();
  if (!SUPPORTED_NETWORKS.includes(n)) {
    const err = new Error(`unsupported_network: ${network} (only TRC20 / USDT-TRON supported)`);
    err.status = 400;
    err.code = 'unsupported_network';
    throw err;
  }
  return 'TRC20';
}

function authHeaders(extra) {
  return {
    'content-type': 'application/json',
    // ADAPTER MAP [1]: VERIFY-WITH-DOCS exact auth scheme before live use.
    authorization: `Bearer ${apiToken()}`,
    ...(extra || {}),
  };
}

// POST /v1/invoices/create — live path only. Throws live_disabled without token.
async function createInvoice({ amountUsdt, orderId, network }) {
  assertNetwork(network);
  const token = apiToken();
  if (!token) {
    const err = new Error('live_disabled: PAY2CRYPTO_API_TOKEN not configured');
    err.status = 409;
    err.code = 'live_disabled';
    throw err;
  }
  // ADAPTER MAP [5]: VERIFY-WITH-DOCS exact field names/units before live use.
  const body = {
    amount: String(amountUsdt),
    order_id: String(orderId),
    currency: 'USDT',
    payment_type: 1, // USDT (researched 2026-10)
    payment_network: 1, // Tron / TRC20 (researched 2026-10)
  };
  const res = await fetch(`${baseUrl()}invoices/create`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`pay2crypto_create_failed: http ${res.status}`);
    err.status = 502;
    err.code = 'provider_error';
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  const invoice = data.invoice || data.data || data || {};
  return {
    invoiceId: String(invoice.invoice_id || invoice.id || invoice.invoiceId || ''),
    payAddress: invoice.pay_address || invoice.address || invoice.payAddress || null,
    amount: invoice.amount != null ? String(invoice.amount) : String(amountUsdt),
    network: 'TRC20',
    raw: data,
  };
}

// GET invoice by id — live path only. Used to RE-FETCH status before crediting.
async function getInvoice(invoiceId) {
  const token = apiToken();
  if (!token) {
    const err = new Error('live_disabled: PAY2CRYPTO_API_TOKEN not configured');
    err.status = 409;
    err.code = 'live_disabled';
    throw err;
  }
  const res = await fetch(`${baseUrl()}invoices/${encodeURIComponent(String(invoiceId))}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = new Error(`pay2crypto_fetch_failed: http ${res.status}`);
    err.status = 502;
    err.code = 'provider_error';
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  const invoice = data.invoice || data.data || data || {};
  return {
    invoiceId: String(invoice.invoice_id || invoice.id || invoiceId),
    status: String(invoice.status || invoice.state || 'unknown'),
    amount: invoice.amount != null ? String(invoice.amount) : null,
    txHash: invoice.tx_hash || invoice.txHash || invoice.hash || null,
    raw: data,
  };
}

const PAID_STATUSES = new Set(['paid', 'confirmed', 'completed', 'success']);
const FAILED_STATUSES = new Set(['failed', 'expired', 'cancelled']);

function isPaidStatus(status) {
  return PAID_STATUSES.has(String(status || '').toLowerCase());
}

function isFailedStatus(status) {
  return FAILED_STATUSES.has(String(status || '').toLowerCase());
}

function withinTolerance(tsValue) {
  if (tsValue == null || tsValue === '') return true; // nothing to check
  const t = typeof tsValue === 'number' ? tsValue : Date.parse(String(tsValue));
  if (Number.isNaN(t)) return false;
  return Math.abs(Date.now() - t) <= WEBHOOK_TOLERANCE_MS;
}

// Verify an inbound webhook. Default: HMAC-SHA256 over raw body bytes.
// Returns { ok, eventId, invoiceId, txHash, amount, status, reason? }.
// Never throws on bad input — returns { ok:false } (caller maps to 400, never 500).
// Dedupe/replay protection is the CALLER's job via payment_provider_events.
function verifyWebhook(rawBody, headers, opts) {
  try {
    const secret = (opts && opts.secret) || webhookSecret() || (opts && opts.fallbackSecret) || '';
    const h = headers || {};
    const sig = h['x-pay2crypto-signature'] || h['x-signature'] || h['x-webhook-signature'] || '';
    const raw = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'bad_json' };
    }
    if (!secret || !sig) return { ok: false, reason: 'missing_secret_or_signature' };
    // ADAPTER MAP [2]: VERIFY-WITH-DOCS algorithm + layout before live use.
    const digest = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
    const clean = String(sig).replace(/^sha256=/i, '');
    let match = false;
    try {
      match = crypto.timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(clean, 'utf8'));
    } catch {
      match = false;
    }
    if (!match) return { ok: false, reason: 'bad_signature' };
    const ts = body.timestamp || body.created_at || body.createdAt || h['x-timestamp'];
    if (!withinTolerance(ts)) return { ok: false, reason: 'stale_event' };
    // ADAPTER MAP [6]: VERIFY-WITH-DOCS canonical field layout.
    const eventId = String(body.event_id || body.eventId || body.id || h['x-event-id'] || `evt-${Date.now()}`);
    const invoiceId = body.invoice_id || body.invoiceId || body.order_id || body.orderId || null;
    const txHash = body.tx_hash || body.txHash || body.hash || null;
    const amount = body.amount != null ? String(body.amount) : body.value != null ? String(body.value) : null;
    const status = body.status || body.state || null;
    return {
      ok: true,
      eventId: String(eventId),
      invoiceId: invoiceId ? String(invoiceId) : null,
      txHash: txHash ? String(txHash) : null,
      amount,
      status: status ? String(status) : null,
      body,
    };
  } catch (e) {
    return { ok: false, reason: e.message || 'verify_error' };
  }
}

// Helper for signing test/sandbox payloads (same default algorithm).
function signPayload(rawBody, secret) {
  const s = secret || webhookSecret();
  return crypto.createHmac('sha256', s).update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody), 'utf8').digest('hex');
}

module.exports = {
  ADAPTER_MAP,
  DEFAULT_BASE_URL,
  SUPPORTED_NETWORKS,
  WEBHOOK_TOLERANCE_MS,
  PAID_STATUSES,
  FAILED_STATUSES,
  assertNetwork,
  createInvoice,
  getInvoice,
  isPaidStatus,
  isFailedStatus,
  verifyWebhook,
  signPayload,
  withinTolerance,
};
