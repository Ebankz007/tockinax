// Ledger double-entry unit tests — hermetic, NO live DB.
// postBalanced() accepts an injected client; we supply a minimal in-memory
// fake implementing the tiny query surface the service uses.
const Decimal = require('decimal.js');
const { postBalanced } = require('../src/lib/ledger');

function makeFakeClient() {
  const txByKey = new Map(); // idempotencyKey -> { id, lines: [] }
  let seq = 0;
  const state = { lastTxId: null };
  return {
    state,
    query: async (text, params = []) => {
      const sql = String(text);
      if (/^\s*BEGIN/i.test(sql)) return { rows: [] };
      if (/^\s*COMMIT/i.test(sql)) return { rows: [] };
      if (/^\s*ROLLBACK/i.test(sql)) return { rows: [] };
      if (sql.includes('insert into ledger_transactions')) {
        const [, , , , key] = params;
        if (txByKey.has(key)) return { rows: [] }; // conflict → replay path
        seq += 1;
        const id = `tx-fake-${seq}`;
        txByKey.set(key, { id, lines: [] });
        state.lastTxId = id;
        return { rows: [{ id }] };
      }
      if (sql.includes('select id from ledger_transactions')) {
        const [key] = params;
        const found = txByKey.get(key);
        if (!found) throw new Error('fake: unknown idempotency key');
        return { rows: [{ id: found.id }] };
      }
      if (sql.includes('insert into ledger_entries')) {
        const [txId, account, debit, credit] = params;
        const tx = [...txByKey.values()].find((t) => t.id === txId);
        if (!tx) throw new Error('fake: unknown tx');
        tx.lines.push({ account, debit: String(debit), credit: String(credit) });
        return { rows: [] };
      }
      if (sql.includes('select sum(debit)')) {
        const [txId] = params;
        const tx = [...txByKey.values()].find((t) => t.id === txId);
        let d = new Decimal(0);
        let c = new Decimal(0);
        for (const l of tx?.lines || []) {
          d = d.plus(new Decimal(l.debit));
          c = c.plus(new Decimal(l.credit));
        }
        // pg returns text numerics — equal strings iff balanced.
        return { rows: [{ d: d.toFixed(4), c: c.toFixed(4) }] };
      }
      throw new Error(`fake client: unhandled query: ${sql.slice(0, 80)}`);
    },
  };
}

describe('ledger double-entry (offline fake client)', () => {
  test('balanced post commits (replayed:false)', async () => {
    const fake = makeFakeClient();
    const res = await postBalanced({
      sourceType: 'test',
      sourceId: null,
      currency: 'USD',
      memo: 'unit',
      idempotencyKey: 'unit-key-1',
      lines: [
        { account: 'ASSET:cash', debit: '100.0000' },
        { account: 'REV:fees', credit: '100.0000' },
      ],
    }, fake);
    expect(res.replayed).toBe(false);
    expect(res.txId).toBe('tx-fake-1');
  });

  test('unbalanced legs throw before commit', async () => {
    const fake = makeFakeClient();
    await expect(postBalanced({
      sourceType: 'test', currency: 'USD', idempotencyKey: 'unit-key-2',
      lines: [
        { account: 'ASSET:cash', debit: '100.0000' },
        { account: 'REV:fees', credit: '99.9999' },
      ],
    }, fake)).rejects.toThrow(/unbalanced/);
  });

  test('negative leg throws', async () => {
    const fake = makeFakeClient();
    await expect(postBalanced({
      sourceType: 'test', currency: 'USD', idempotencyKey: 'unit-key-3',
      lines: [
        { account: 'ASSET:cash', debit: '-5' },
        { account: 'REV:fees', credit: '5' },
      ],
    }, fake)).rejects.toThrow(/negative leg/);
  });

  test('leg cannot be both debit and credit', async () => {
    const fake = makeFakeClient();
    await expect(postBalanced({
      sourceType: 'test', currency: 'USD', idempotencyKey: 'unit-key-4',
      lines: [
        { account: 'ASSET:cash', debit: '10', credit: '10' },
        { account: 'REV:fees', credit: '10' },
      ],
    }, fake)).rejects.toThrow(/both debit and credit/);
  });

  test('idempotent replay returns replayed:true (no double-post)', async () => {
    const fake = makeFakeClient();
    const body = {
      sourceType: 'order_fee', currency: 'NGN', memo: 'replay',
      idempotencyKey: 'unit-key-replay',
      lines: [
        { account: 'MEMO:member_volume_NGN', debit: '50.0000' },
        { account: 'REV:marketplace_fees', credit: '50.0000' },
      ],
    };
    const first = await postBalanced(body, fake);
    const second = await postBalanced(body, fake);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.txId).toBe(first.txId);
  });

  test('missing idempotencyKey throws', async () => {
    const fake = makeFakeClient();
    await expect(postBalanced({
      sourceType: 'test', currency: 'USD',
      lines: [
        { account: 'A', debit: '1' },
        { account: 'B', credit: '1' },
      ],
    }, fake)).rejects.toThrow(/idempotencyKey required/);
  });
});
