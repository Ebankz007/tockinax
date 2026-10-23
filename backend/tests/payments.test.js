// Pay2Crypto payments — hermetic tests (OFFLINE, no DB, no network).
// Covers: TRC20-only validation, TRC20 address format, webhook bad-signature
// 400 path (verify happens BEFORE any DB call), provider-event dedupe logic,
// sandbox lifecycle create->pay->confirm with explicit 'sandbox' marking,
// and balanced deposit-credit legs via an in-memory ledger fake.
const crypto = require('crypto');
const request = require('supertest');
const Decimal = require('decimal.js');

const p2c = require('../src/lib/pay2crypto');
const sandbox = require('../src/lib/pay2crypto-sandbox');
const { postBalanced } = require('../src/lib/ledger');
const { isTronAddress, availableSimUsdt } = require('../src/routes/v1.withdrawals');
const { recordProviderEvent } = require('../src/routes/v1.pay2crypto-webhook');
const { validateIntentInput } = require('../src/routes/v1.deposits');

const GOOD_TRC20 = `T${'A'.repeat(33)}`; // T + 33 base58 chars
const GOOD_TRC20_2 = `T${'J'.repeat(16)}${'m'.repeat(17)}`;

function makeLedgerFake() {
  const txByKey = new Map();
  let seq = 0;
  return {
    query: async (text, params = []) => {
      const sql = String(text);
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      if (sql.includes('insert into ledger_transactions')) {
        const key = params[4];
        if (txByKey.has(key)) return { rows: [] };
        seq += 1;
        const id = `tx-fake-${seq}`;
        txByKey.set(key, { id, lines: [] });
        return { rows: [{ id }] };
      }
      if (sql.includes('select id from ledger_transactions')) {
        return { rows: [{ id: txByKey.get(params[0]).id }] };
      }
      if (sql.includes('insert into ledger_entries')) {
        const [txId, account, debit, credit] = params;
        [...txByKey.values()].find((t) => t.id === txId).lines.push({ account, debit: String(debit), credit: String(credit) });
        return { rows: [] };
      }
      if (sql.includes('select sum(debit)')) {
        const tx = [...txByKey.values()].find((t) => t.id === params[0]);
        let d = new Decimal(0);
        let c = new Decimal(0);
        for (const l of tx.lines) { d = d.plus(new Decimal(l.debit)); c = c.plus(new Decimal(l.credit)); }
        return { rows: [{ d: d.toFixed(4), c: c.toFixed(4) }] };
      }
      throw new Error(`ledger fake: unhandled: ${sql.slice(0, 60)}`);
    },
    txByKey,
  };
}

function makeEventFake() {
  const seen = new Set();
  return {
    query: async (text, params = []) => {
      if (!String(text).includes('insert into payment_provider_events')) throw new Error('unexpected');
      const key = `pay2crypto:${params[0]}`;
      if (seen.has(key)) return { rowCount: 0, rows: [] }; // ON CONFLICT DO NOTHING
      seen.add(key);
      return { rowCount: 1, rows: [{ id: 'evt-1' }] };
    },
  };
}

describe('TRC20-only network validation', () => {
  test('TRC20 accepted (case-insensitive)', () => {
    expect(p2c.assertNetwork('TRC20')).toBe('TRC20');
    expect(p2c.assertNetwork('trc20')).toBe('TRC20');
  });
  test('BEP20/ERC20 rejected with unsupported_network', () => {
    for (const n of ['BEP20', 'ERC20', 'bep20', 'SOL', 'BTC']) {
      try {
        p2c.assertNetwork(n);
        throw new Error(`should have thrown for ${n}`);
      } catch (e) {
        expect(e.code).toBe('unsupported_network');
      }
    }
  });
  test('deposit intent rejects non-TRC20 with 400 path', () => {
    expect(() => validateIntentInput({ purpose: 'token_purchase', amount: '10', network: 'BEP20' })).toThrow();
    try {
      validateIntentInput({ purpose: 'token_purchase', amount: '10', network: 'ERC20' });
      throw new Error('no-throw');
    } catch (e) {
      expect(e.code).toBe('unsupported_network');
      expect(e.status).toBe(400);
    }
  });
  test('deposit intent accepts TRC20 default + all purposes', () => {
    for (const purpose of ['registration_fee', 'token_purchase', 'stage_upgrade', 'stage_renewal']) {
      const v = validateIntentInput({ purpose, amount: '25.5' });
      expect(v.network).toBe('TRC20');
      expect(v.amount).toBe('25.5000');
    }
  });
});

describe('TRC20 address format', () => {
  test('accepts well-formed addresses', () => {
    expect(isTronAddress(GOOD_TRC20)).toBe(true);
    expect(isTronAddress(GOOD_TRC20_2)).toBe(true);
    expect(isTronAddress(`  ${GOOD_TRC20}  `)).toBe(true);
  });
  test('rejects malformed addresses', () => {
    expect(isTronAddress('0xabc123')).toBe(false); // EVM style
    expect(isTronAddress('bnb1xyz')).toBe(false);
    expect(isTronAddress('T' + 'A'.repeat(32))).toBe(false); // 33 chars
    expect(isTronAddress('T' + 'A'.repeat(34))).toBe(false); // 35 chars
    expect(isTronAddress('X' + 'A'.repeat(33))).toBe(false); // wrong prefix
    expect(isTronAddress('T0OIl' + 'A'.repeat(28))).toBe(false); // non-base58 chars
    expect(isTronAddress('')).toBe(false);
    expect(isTronAddress(null)).toBe(false);
  });
});

describe('webhook bad-signature path (offline, no DB)', () => {
  test('verifyWebhook returns ok:false on tampered signature (never throws)', () => {
    const raw = JSON.stringify({ event_id: 'e1', invoice_id: 'i1', amount: '10' });
    const r = p2c.verifyWebhook(raw, { 'x-pay2crypto-signature': 'deadbeef' }, { secret: 's3cret' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('bad_signature');
  });
  test('verifyWebhook returns ok:false when signature missing', () => {
    const r = p2c.verifyWebhook(JSON.stringify({ a: 1 }), {}, { secret: 's3cret' });
    expect(r.ok).toBe(false);
  });
  test('POST /pay2crypto-webhook with bad signature -> 400 (never 500), no DB touched', async () => {
    const app = require('express')();
    app.use(require('express').json());
    app.use('/api/v1/pay2crypto-webhook', require('../src/routes/v1.pay2crypto-webhook'));
    const r = await request(app).post('/api/v1/pay2crypto-webhook/pay2crypto').send({ event_id: 'e-bad', invoice_id: 'i-bad' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('bad_signature');
  });
});

describe('provider-event dedupe logic', () => {
  test('first insert ok, replay is duplicate (fake client)', async () => {
    const fake = makeEventFake();
    const first = await recordProviderEvent(fake, 'evt-dedupe-1', { a: 1 }, true);
    const second = await recordProviderEvent(fake, 'evt-dedupe-1', { a: 1 }, true);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
  });
  test('different event ids do not collide', async () => {
    const fake = makeEventFake();
    expect((await recordProviderEvent(fake, 'evt-A', {}, true)).duplicate).toBe(false);
    expect((await recordProviderEvent(fake, 'evt-B', {}, true)).duplicate).toBe(false);
  });
});

describe('sandbox lifecycle create -> pay -> confirm (SIMULATION)', () => {
  beforeEach(() => sandbox.__clear());
  test('invoice carries sandbox:true + SIMULATION label + TRC20 address', () => {
    const inv = sandbox.createInvoice({ amountUsdt: '50.0000', orderId: 'order-1' });
    expect(inv.sandbox).toBe(true);
    expect(inv.label).toMatch(/SIMULATION/);
    expect(inv.network).toBe('TRC20');
    expect(isTronAddress(inv.payAddress)).toBe(true);
    expect(inv.status).toBe('pending');
  });
  test('simulatePay signs payload; verifyWebhook accepts with sandbox secret', () => {
    process.env.PAY2CRYPTO_WEBHOOK_SECRET = 'test-sandbox-secret';
    const inv = sandbox.createInvoice({ amountUsdt: '50.0000', orderId: 'order-2' });
    const { rawBody, headers, payload } = sandbox.simulatePay(inv.invoiceId);
    expect(payload.sandbox).toBe(true);
    expect(payload.status).toBe('paid');
    const v = p2c.verifyWebhook(rawBody, headers);
    expect(v.ok).toBe(true);
    expect(v.invoiceId).toBe(inv.invoiceId);
    expect(v.txHash).toMatch(/^sandbox-tx-/);
    expect(v.amount).toBe('50.0000');
  });
  test('sandbox fake refuses use when sandbox mode is off', () => {
    process.env.PAY2CRYPTO_SANDBOX = 'false';
    expect(() => sandbox.createInvoice({ amountUsdt: '1', orderId: 'x' })).toThrow(/sandbox_disabled/);
    process.env.PAY2CRYPTO_SANDBOX = 'true';
  });
  test('deposit credit legs balance: DEBIT clearing / CREDIT LIAB:sim_usdt, idempotent replay', async () => {
    const fake = makeLedgerFake();
    const legs = {
      sourceType: 'sim_funding',
      sourceId: '00000000-0000-0000-0000-000000000001',
      currency: 'USDT',
      memo: 'sandbox deposit confirm',
      idempotencyKey: 'sim:funding:intent-sandbox-1',
      lines: [
        { account: 'SIM:usdt_clearing', debit: '50.0000' },
        { account: 'LIAB:sim_usdt', credit: '50.0000' },
      ],
    };
    const first = await postBalanced(legs, fake);
    const second = await postBalanced(legs, fake);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    const tx = fake.txByKey.get('sim:funding:intent-sandbox-1');
    const credit = tx.lines.find((l) => l.account === 'LIAB:sim_usdt');
    expect(credit.credit).toBe('50.0000');
  });
});

describe('available balance nets pending withdrawals (fake db)', () => {
  function fakeDb({ funding = '100.0000', spent = '0', bought = '0', sold = '0', locked = '0' } = {}) {
    return {
      query: async (text) => {
        const sql = String(text);
        if (sql.includes("source_type = 'sim_funding'")) return { rows: [{ bal: funding }] };
        if (sql.includes('from token_holdings')) return { rows: [{ tot: spent }] };
        if (sql.includes('from token_fills where buyer_id')) return { rows: [{ tot: bought }] };
        if (sql.includes('join token_listings')) return { rows: [{ tot: sold }] };
        if (sql.includes('from withdrawal_requests')) return { rows: [{ tot: locked }] };
        throw new Error(`unhandled: ${sql.slice(0, 50)}`);
      },
    };
  }
  test('funding minus locked pending = available', async () => {
    const avail = await availableSimUsdt(fakeDb({ funding: '100.0000', locked: '30.0000' }), 'u1');
    expect(avail.toFixed(4)).toBe('70.0000');
  });
  test('spends reduce availability', async () => {
    const avail = await availableSimUsdt(fakeDb({ funding: '100.0000', spent: '40.0000', locked: '10.0000' }), 'u1');
    expect(avail.toFixed(4)).toBe('50.0000');
  });
});

describe('live paths stay OFF without keys (offline)', () => {
  test('live createInvoice without token -> 409 live_disabled (no network call)', async () => {
    const prev = process.env.PAY2CRYPTO_API_TOKEN;
    delete process.env.PAY2CRYPTO_API_TOKEN;
    await expect(p2c.createInvoice({ amountUsdt: '10', orderId: 'o1', network: 'TRC20' })).rejects.toMatchObject({ code: 'live_disabled', status: 409 });
    await expect(p2c.getInvoice('inv-x')).rejects.toMatchObject({ code: 'live_disabled' });
    if (prev !== undefined) process.env.PAY2CRYPTO_API_TOKEN = prev;
  });
  test('deposits/withdrawals routers require auth (anon -> 401, offline)', async () => {
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/v1/deposits', require('../src/routes/v1.deposits'));
    app.use('/api/v1/withdrawals', require('../src/routes/v1.withdrawals'));
    const r1 = await request(app).post('/api/v1/deposits/intent').send({ purpose: 'token_purchase', amount: '10' });
    expect(r1.status).toBe(401);
    const r2 = await request(app).post('/api/v1/withdrawals/request').send({ amount: '10', dest_address: GOOD_TRC20 });
    expect(r2.status).toBe(401);
  });
});
