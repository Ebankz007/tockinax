// Money helpers — Decimal only, never float.
const Decimal = require('decimal.js');
const { getPool } = require('./db');

// Post a balanced double-entry transaction. Throws if unbalanced.
// lines: [{ account, debit?, credit? }] as string|number (decimal-safe strings preferred)
async function postBalanced({ sourceType, sourceId, currency, memo, idempotencyKey, lines }, client) {
  const pool = getPool();
  const useClient = client || await pool.connect();
  const release = client ? () => {} : () => useClient.release();
  try {
    if (!idempotencyKey) throw new Error('idempotencyKey required');
    if (!lines || lines.length < 2) throw new Error('at least 2 lines required');
    let d = new Decimal(0), c = new Decimal(0);
    for (const l of lines) {
      d = d.plus(new Decimal(l.debit || 0));
      c = c.plus(new Decimal(l.credit || 0));
      if (new Decimal(l.debit || 0).isNeg() || new Decimal(l.credit || 0).isNeg()) throw new Error('negative leg');
      if (new Decimal(l.debit || 0).gt(0) && new Decimal(l.credit || 0).gt(0)) throw new Error('leg cannot be both debit and credit');
    }
    if (!d.equals(c)) throw new Error(`unbalanced: debit=${d} credit=${c}`);
    await useClient.query('BEGIN');
    const txRes = await useClient.query(
      `insert into ledger_transactions (source_type, source_id, currency, memo, idempotency_key)
       values ($1,$2,$3,$4,$5) on conflict (idempotency_key) do nothing returning id`,
      [sourceType, sourceId || null, currency, memo || null, idempotencyKey]
    );
    let txId;
    if (txRes.rows.length === 0) {
      const ex = await useClient.query(`select id from ledger_transactions where idempotency_key=$1`, [idempotencyKey]);
      txId = ex.rows[0].id; // idempotent replay — return existing, do not double-post
      await useClient.query('COMMIT');
      return { txId, replayed: true };
    } else txId = txRes.rows[0].id;
    for (const l of lines) {
      await useClient.query(
        `insert into ledger_entries (tx_id, account, debit, credit) values ($1,$2,$3,$4)`,
        [txId, l.account, new Decimal(l.debit || 0).toFixed(4), new Decimal(l.credit || 0).toFixed(4)]
      );
    }
    // DB-level balance guard
    const chk = await useClient.query(
      `select sum(debit)::text as d, sum(credit)::text as c from ledger_entries where tx_id=$1`, [txId]);
    if (chk.rows[0].d !== chk.rows[0].c) throw new Error('balance check failed');
    await useClient.query('COMMIT');
    return { txId, replayed: false };
  } catch (e) {
    try { await useClient.query('ROLLBACK'); } catch {}
    throw e;
  } finally { release(); }
}

module.exports = { postBalanced, Decimal };
