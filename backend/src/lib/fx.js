// FX helper — indicative rates only, never used to auto-settle without review.
const { Decimal } = require('decimal.js');
const { getPool } = require('./db');

async function getRate(base, quote) {
  if (base === quote) return { rate: '1', source: 'identity', note: 'indicative' };
  try {
    const r = await getPool().query(
      `select rate, source from fx_rates where base = $1 and quote = $2 order by fetched_at desc limit 1`,
      [base, quote]
    );
    if (r.rowCount) return { rate: new Decimal(r.rows[0].rate).toString(), source: r.rows[0].source, note: 'indicative' };
    const inv = await getPool().query(
      `select rate, source from fx_rates where base = $1 and quote = $2 order by fetched_at desc limit 1`,
      [quote, base]
    );
    if (inv.rowCount && Number(inv.rows[0].rate) !== 0)
      return { rate: new Decimal(1).div(new Decimal(inv.rows[0].rate)).toString(), source: inv.rows[0].source, note: 'indicative' };
  } catch { /* DB unavailable — fall through */ }
  return { rate: '1', source: 'fallback', note: 'indicative' };
}

module.exports = { getRate };
