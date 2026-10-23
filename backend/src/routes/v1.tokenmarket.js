// Secondary token market — SIMULATED pilot, market-clearing: unsold stays unsold.
// NO auto-complete fiction: a fill completes ONLY here on settled USDT payment.
// Oversell guard: SELECT ... FOR UPDATE + Decimal compare; idempotent fills.
const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { Decimal } = require('../lib/ledger');

const router = express.Router();
router.use(authRequired);

// Pure oversell guard — hermetic, unit-tested. Throws on invalid.
function validateBuyQty(remaining, qty) {
  const r = new Decimal(remaining);
  const q = new Decimal(qty);
  if (q.lte(0)) throw new Error('invalid_qty');
  if (r.lt(0)) throw new Error('invalid_remaining');
  if (q.gt(r)) throw new Error('oversell');
  return true;
}

// GET /tokenmarket/listings — open/partial only, search/sort/paginate
router.get('/listings', async (req, res, next) => {
  try {
    const q = z.object({
      seller: z.string().uuid().optional(),
      sort: z.enum(['price_asc', 'price_desc', 'newest']).default('newest'),
      page: z.coerce.number().int().min(1).default(1),
      per: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(req.query);
    const orderBy = q.sort === 'price_asc' ? 'ask_unit_price asc' : q.sort === 'price_desc' ? 'ask_unit_price desc' : 'created_at desc';
    const pool = getPool();
    const r = await pool.query(
      `select * from token_listings where status in ('open','partial')
       and ($1::uuid is null or seller_id = $1::uuid)
       order by ${orderBy} limit $2 offset $3`,
      [q.seller || null, q.per, (q.page - 1) * q.per]
    );
    res.json({ page: q.page, per: q.per, items: r.rows, note: 'Unsold stays listed — no auto-complete, no price fiction.' });
  } catch (e) { next(e); }
});

// POST /tokenmarket/listings/:id/buy {qty}
router.post('/listings/:id/buy', async (req, res, next) => {
  try {
    const { qty } = z.object({ qty: z.string().regex(/^\d+(\.\d{1,4})?$/) }).parse(req.body);
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const l = await client.query(`select * from token_listings where id = $1 for update`, [req.params.id]);
      if (!l.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'listing_not_found' }); }
      const listing = l.rows[0];
      if (!['open', 'partial'].includes(listing.status)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'listing_not_open', status: listing.status }); }
      if (listing.seller_id === req.user.id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'cannot_buy_own' }); }
      try { validateBuyQty(listing.remaining_qty, qty); }
      catch (e) { await client.query('ROLLBACK'); return res.status(409).json({ error: e.message === 'oversell' ? 'insufficient_remaining' : 'invalid_qty', remaining: listing.remaining_qty }); }

      const qDec = new Decimal(qty);
      const unitDec = new Decimal(listing.ask_unit_price);
      const totalDec = qDec.mul(unitDec);
      const total = totalDec.toFixed(4);

      // Buyer SIM-USDT balance (same helper as tokens route — funding from ledger minus spends plus proceeds)
      const { simBalance } = require('./v1.tokens');
      const bal = await simBalance(req.user.id, client);
      if (bal.lessThan(totalDec)) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'insufficient_sim_usdt', balance: bal.toFixed(4) }); }

      // Settle USDT buyer -> seller proceeds. Single 4-leg balanced tx (global clearing accounts;
      // per-user attribution lives in token_fills + token_listings domain records).
      // Buyer out: debit LIAB / credit clearing; Seller in: debit clearing / credit LIAB. Net balanced in USDT.
      const fillId = crypto.randomUUID();
      const idem = 'tkxfill-' + crypto.createHash('sha256').update(`${listing.id}:${req.user.id}:${qty}:${total}`).digest('hex').slice(0, 32);
      const ledgerKey = `ledger:${idem}`;
      const exTx = await client.query(`select id from ledger_transactions where idempotency_key = $1`, [ledgerKey]);
      let txId;
      if (exTx.rowCount) {
        txId = exTx.rows[0].id;
      } else {
        const txIns = await client.query(
          `insert into ledger_transactions (source_type, source_id, currency, memo, idempotency_key)
           values ('token_fill', $1, 'USDT', $2, $3) on conflict (idempotency_key) do nothing returning id`,
          [fillId, `token fill ${fillId} listing ${listing.id} buyer ${req.user.id} seller ${listing.seller_id}`, ledgerKey]
        );
        if (txIns.rowCount) txId = txIns.rows[0].id;
        else (await client.query(`select id from ledger_transactions where idempotency_key=$1`, [ledgerKey]), txId = null);
        if (!txId) {
          const again = await client.query(`select id from ledger_transactions where idempotency_key=$1`, [ledgerKey]);
          txId = again.rows[0].id;
        } else {
          // Only post legs on first insert (replay skips double-post)
          const legs = [
            { account: 'LIAB:sim_usdt', debit: total, credit: '0' },
            { account: 'SIM:usdt_clearing', debit: '0', credit: total },
            { account: 'SIM:usdt_clearing', debit: total, credit: '0' },
            { account: 'LIAB:sim_usdt', debit: '0', credit: total },
          ];
          for (const leg of legs) {
            await client.query(`insert into ledger_entries (tx_id, account, debit, credit) values ($1,$2,$3,$4)`, [txId, leg.account, leg.debit, leg.credit]);
          }
          const chk = await client.query(`select sum(debit)::text as d, sum(credit)::text as c from ledger_entries where tx_id=$1`, [txId]);
          if (chk.rows[0].d !== chk.rows[0].c) throw new Error('balance check failed');
        }
      }

      const newRemaining = new Decimal(listing.remaining_qty).minus(qDec).toFixed(4);
      const newStatus = new Decimal(newRemaining).equals(0) ? 'filled' : 'partial';
      await client.query(`update token_listings set remaining_qty=$1, status=$2, updated_at=now() where id=$3`, [newRemaining, newStatus, listing.id]);
      const fill = await client.query(
        `insert into token_fills (id, listing_id, buyer_id, qty, unit_price, total, idempotency)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict (idempotency) do nothing returning *`,
        [fillId, listing.id, req.user.id, qDec.toFixed(4), unitDec.toFixed(4), total, idem]
      );
      await client.query('COMMIT');
      const row = fill.rowCount ? fill.rows[0] : (await pool.query(`select * from token_fills where idempotency=$1`, [idem])).rows[0];
      res.status(201).json({ fill: row, listing_status: newStatus, remaining_qty: newRemaining, settled: true });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    } finally { client.release(); }
  } catch (e) { next(e); }
});

router.get('/fills/mine', async (req, res, next) => {
  try {
    const r = await getPool().query(`select * from token_fills where buyer_id=$1 order by created_at desc`, [req.user.id]);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// GET /tokenmarket/proceeds — seller receipts + unsold balances (unsold stays visible)
router.get('/proceeds', async (req, res, next) => {
  try {
    const pool = getPool();
    const receipts = await pool.query(
      `select f.* from token_fills f join token_listings l on l.id=f.listing_id where l.seller_id=$1 order by f.created_at desc`,
      [req.user.id]);
    const unsold = await pool.query(
      `select * from token_listings where seller_id=$1 and status in ('open','partial') order by created_at desc`,
      [req.user.id]);
    const soldTotal = await pool.query(
      `select coalesce(sum(f.total),0)::text as tot from token_fills f join token_listings l on l.id=f.listing_id where l.seller_id=$1`,
      [req.user.id]);
    res.json({
      receipts: receipts.rows,
      unsold: unsold.rows,
      sold_total: soldTotal.rows[0].tot,
      policy: 'Market-clearing: unsold stays unsold and visible. No buy-back, no auto-complete.',
    });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.validateBuyQty = validateBuyQty;
