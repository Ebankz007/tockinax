// Idempotency-Key reader — normalises the header onto req.idempotencyKey.
// Writers (ledger posts, payout requests, webhooks) enforce uniqueness in SQL
// via `on conflict (idempotency_key) do nothing` + replay semantics.
// Usage: router.post('/orders', idempotency({ required: false }), handler)
function idempotency({ required = false, header = 'idempotency-key' } = {}) {
  return (req, res, next) => {
    const raw = req.headers[header] ?? req.headers['x-idempotency-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (typeof key === 'string' && key.length >= 8 && key.length <= 96) {
      req.idempotencyKey = key;
      return next();
    }
    if (required) {
      return res.status(400).json({
        error: 'idempotency_key_required',
        message: `Send \`${header}\` header (8-96 chars) for safe retries.`,
      });
    }
    req.idempotencyKey = undefined;
    return next();
  };
}

module.exports = { idempotency };
