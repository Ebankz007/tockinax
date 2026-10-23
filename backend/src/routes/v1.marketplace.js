const express = require('express');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { evidenceUpload } = require('../middleware/upload');

const router = express.Router();
router.use(authRequired);

const listingSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().min(10).max(5000),
  category: z.string().max(64).default('general'),
  price: z.string().regex(/^\d+(\.\d{1,4})?$/),
  currency: z.enum(['USD', 'NGN']),
  stock: z.number().int().min(1).default(1),
  deliveryTerms: z.string().max(2000).optional(),
});

// POST /marketplace/listings — seller-gated
router.post('/listings', async (req, res, next) => {
  try {
    const pool = getPool();
    const me = await pool.query(`select seller_enabled, status from users where id=$1`, [req.user.id]);
    if (!me.rows[0].seller_enabled) return res.status(403).json({ error: 'seller_not_enabled' });
    const b = listingSchema.parse(req.body);
    const r = await pool.query(
      `insert into listings (seller_id, title, description, category, price, currency, stock, status, delivery_terms)
       values ($1,$2,$3,$4,$5,$6,$7,'pending_review',$8) returning *`,
      [req.user.id, b.title, b.description, b.category, b.price, b.currency, b.stock, b.deliveryTerms || null]);
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.get('/listings', async (req, res, next) => {
  try {
    const pool = getPool();
    const { q, category, page = '1', per = '20' } = req.query;
    const p = Math.max(1, parseInt(page, 10) || 1), n = Math.min(50, parseInt(per, 10) || 20);
    const r = await pool.query(
      `select * from listings where status='active' and ($1::text is null or title ilike '%'||$1||'%') and ($2::text is null or category=$2)
       order by created_at desc limit $3 offset $4`, [q || null, category || null, n, (p - 1) * n]);
    res.json({ page: p, per: n, items: r.rows });
  } catch (e) { next(e); }
});

// POST /marketplace/orders — server-side pricing, never trust client amount
router.post('/orders', async (req, res, next) => {
  try {
    const { listingId, qty = 1, paymentMethod } = z.object({
      listingId: z.string().uuid(), qty: z.number().int().min(1).default(1), paymentMethod: z.string().max(48),
    }).parse(req.body);
    const pool = getPool();
    const l = await pool.query(`select * from listings where id=$1 and status='active'`, [listingId]);
    if (!l.rowCount) return res.status(404).json({ error: 'listing_unavailable' });
    const li = l.rows[0];
    if (li.seller_id === req.user.id) return res.status(400).json({ error: 'cannot_buy_own' });
    const Decimal = require('decimal.js');
    const amount = new Decimal(li.price).times(qty).toFixed(4);
    const fee = new Decimal(amount).times(0.01).toFixed(4); // 1% platform fee — configurable via system_settings in admin
    const orderNo = 'TKX-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    const o = await pool.query(
      `insert into orders (order_no, buyer_id, seller_id, listing_id, amount, currency, platform_fee, status, payment_method, payment_instructions, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,'pending_payment',$8,$9, now()+interval '48 hours') returning *`,
      [orderNo, req.user.id, li.seller_id, listingId, amount, li.currency, fee, paymentMethod,
        `Pay the seller directly via approved method (${paymentMethod}). Platform records but does NOT hold funds — no escrow implied.`]);
    await pool.query(`insert into order_items (order_id, title, qty, unit_price) values ($1,$2,$3,$4)`, [o.rows[0].id, li.title, qty, li.price]);
    res.status(201).json(o.rows[0]);
  } catch (e) { next(e); }
});

// POST /marketplace/orders/:id/evidence — evidence stays PENDING, never auto-completes
router.post('/orders/:id/evidence', async (req, res, next) => {
  try {
    const { providerRef, note } = z.object({ providerRef: z.string().max(128).optional(), note: z.string().max(1000).optional() }).parse(req.body);
    const pool = getPool();
    const o = await pool.query(`select * from orders where id=$1 and buyer_id=$2`, [req.params.id, req.user.id]);
    if (!o.rowCount) return res.status(404).json({ error: 'not_found' });
    if (!['pending_payment', 'evidence_submitted'].includes(o.rows[0].status)) return res.status(409).json({ error: 'bad_state' });
    await pool.query(`insert into payment_evidence (order_id, submitted_by, provider_ref, note) values ($1,$2,$3,$4)`, [o.rows[0].id, req.user.id, providerRef || null, note || null]);
    await pool.query(`update orders set status='evidence_submitted', updated_at=now() where id=$1`, [o.rows[0].id]);
    res.json({ ok: true, message: 'Evidence recorded as PENDING review. Order is NOT marked paid until provider confirmation or manual review.' });
  } catch (e) { next(e); }
});

// POST /marketplace/orders/:id/evidence/file — private file upload (png/jpg/pdf ≤5MB, magic-byte verified).
// Raw bytes in body; optional X-Provider-Ref / X-Note headers. Still PENDING — never auto-completes.
router.post('/orders/:id/evidence/file',
  express.raw({ type: '*/*', limit: '5mb' }),
  evidenceUpload({ required: true }),
  async (req, res, next) => {
    try {
      const pool = getPool();
      const o = await pool.query(`select * from orders where id=$1 and buyer_id=$2`, [req.params.id, req.user.id]);
      if (!o.rowCount) return res.status(404).json({ error: 'not_found' });
      if (!['pending_payment', 'evidence_submitted'].includes(o.rows[0].status)) return res.status(409).json({ error: 'bad_state' });
      const providerRef = String(req.headers['x-provider-ref'] || '').slice(0, 128) || null;
      const note = String(req.headers['x-note'] || '').slice(0, 1000) || null;
      const kind = req.fileCheck.kind; // image/png | image/jpeg | application/pdf
      const ext = kind === 'image/png' ? 'png' : kind === 'image/jpeg' ? 'jpg' : 'pdf';
      const { saveEvidence } = require('../lib/storage');
      const storageKey = await saveEvidence(req.body, ext);
      const ev = await pool.query(
        `insert into payment_evidence (order_id, submitted_by, storage_key, provider_ref, note) values ($1,$2,$3,$4,$5) returning id, created_at`,
        [o.rows[0].id, req.user.id, storageKey, providerRef, note]);
      await pool.query(`update orders set status='evidence_submitted', updated_at=now() where id=$1`, [o.rows[0].id]);
      res.status(201).json({ ok: true, evidenceId: ev.rows[0].id, kind, bytes: req.fileCheck.bytes, message: 'File stored privately as PENDING review. Order is NOT marked paid.' });
    } catch (e) { next(e); }
  });

// GET /marketplace/orders/:id/evidence — metadata only (party or staff), never file bytes
router.get('/orders/:id/evidence', async (req, res, next) => {
  try {
    const pool = getPool();
    const o = await pool.query(`select buyer_id, seller_id from orders where id=$1`, [req.params.id]);
    if (!o.rowCount) return res.status(404).json({ error: 'not_found' });
    const { buyer_id, seller_id } = o.rows[0];
    let staff = false;
    if (req.user.id !== buyer_id && req.user.id !== seller_id) {
      const s = await pool.query(`select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=$1 and r.name in ('super_admin','support','finance')`, [req.user.id]);
      if (!s.rowCount) return res.status(403).json({ error: 'forbidden' });
      staff = true;
    }
    const ev = await pool.query(`select id, provider_ref, note, review_status, created_at, (storage_key is not null) as has_file from payment_evidence where order_id=$1 order by created_at`, [req.params.id]);
    res.json({ staff, items: ev.rows });
  } catch (e) { next(e); }
});

// GET /marketplace/evidence/:evidenceId/file — private download (party or staff only)
router.get('/evidence/:evidenceId/file', async (req, res, next) => {
  try {
    const pool = getPool();
    const ev = await pool.query(`select e.*, o.buyer_id, o.seller_id from payment_evidence e join orders o on o.id=e.order_id where e.id=$1`, [req.params.evidenceId]);
    if (!ev.rowCount || !ev.rows[0].storage_key) return res.status(404).json({ error: 'not_found' });
    const row = ev.rows[0];
    if (req.user.id !== row.buyer_id && req.user.id !== row.seller_id) {
      const s = await pool.query(`select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=$1 and r.name in ('super_admin','support','finance')`, [req.user.id]);
      if (!s.rowCount) return res.status(403).json({ error: 'forbidden' });
    }
    const path = require('path');
    const { storageDir } = require('../lib/storage');
    const abs = path.join(storageDir(), path.basename(row.storage_key));
    res.sendFile(abs, (err) => { if (err) next(err); });
  } catch (e) { next(e); }
});

// POST /marketplace/listings/:id/images — seller-owned private image (same guards)
router.post('/listings/:id/images',
  express.raw({ type: '*/*', limit: '5mb' }),
  evidenceUpload({ required: true }),
  async (req, res, next) => {
    try {
      const pool = getPool();
      const l = await pool.query(`select * from listings where id=$1 and seller_id=$2`, [req.params.id, req.user.id]);
      if (!l.rowCount) return res.status(404).json({ error: 'not_found' });
      const kind = req.fileCheck.kind;
      if (kind === 'application/pdf') return res.status(400).json({ error: 'images_only' });
      const ext = kind === 'image/png' ? 'png' : 'jpg';
      const { saveEvidence } = require('../lib/storage');
      const storageKey = await saveEvidence(req.body, ext);
      const n = await pool.query(`select coalesce(max(sort_order),-1)+1 as nxt from listing_images where listing_id=$1`, [req.params.id]);
      const img = await pool.query(`insert into listing_images (listing_id, storage_key, sort_order) values ($1,$2,$3) returning id`, [req.params.id, storageKey, n.rows[0].nxt]);
      res.status(201).json({ ok: true, imageId: img.rows[0].id, kind });
    } catch (e) { next(e); }
  });

module.exports = router;
