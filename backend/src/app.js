const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Explicit HSTS: 180 days, subdomains, preload. Browsers enforce HTTPS only.
    hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '256kb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  // Tight CORS: reflect ONLY allow-listed APP_URL origins (comma-separated), credentials on.
  const allowList = (process.env.APP_URL || 'http://localhost:3001').split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / curl / health checks
      if (allowList.includes(origin)) return cb(null, true);
      const err = new Error('cors_origin_denied');
      err.status = 403; err.code = 'cors_origin_denied';
      return cb(err);
    },
    credentials: true,
  }));

  // Global API guard: 120 req/min per IP across /api/v1 (auth/webhooks have tighter sub-limits below).
  app.use('/api/v1', rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/v1/auth', rateLimit({ windowMs: 60_000, max: 30 }));
  app.use('/api/v1/webhooks', rateLimit({ windowMs: 60_000, max: 60 }));

  app.get('/healthz', (_req, res) => res.json({ ok: true, svc: 'tockinax-backend', time: new Date().toISOString() }));
  app.get('/readyz', async (_req, res) => {
    try { await require('./lib/db').ready(); res.json({ ok: true }); }
    catch (e) { res.status(503).json({ ok: false, error: e.message }); }
  });

  app.use('/api/v1/auth', require('./routes/v1.auth'));
  app.use('/api/v1/marketplace', require('./routes/v1.marketplace'));
  app.use('/api/v1/referrals', require('./routes/v1.referrals'));
  app.use('/api/v1/rewards', require('./routes/v1.rewards'));
  app.use('/api/v1/payouts', require('./routes/v1.payouts'));
  app.use('/api/v1/admin', require('./routes/v1.admin'));
  app.use('/api/v1/disputes', require('./routes/v1.disputes'));
  app.use('/api/v1/support', require('./routes/v1.support'));
  app.use('/api/v1/content', require('./routes/v1.content'));
  app.use('/api/v1/users', require('./routes/v1.users'));
  app.use('/api/v1/webhooks', require('./routes/v1.webhooks'));
  app.use('/api/v1/finance', require('./routes/v1.finance'));
  const tokenCompat = require('./routes/v1.tokencompat');
  app.use('/api/v1/tokens', require('./routes/v1.tokens'));
  app.use('/api/v1/tokens', tokenCompat.tokensCompat);
  app.use('/api/v1/tokenmarket', require('./routes/v1.tokenmarket'));
  app.use('/api/v1/tokenmarket', tokenCompat.tokenmarketCompat);
  app.use('/api/v1/deposits', require('./routes/v1.deposits'));
  app.use('/api/v1/deposits', tokenCompat.depositsCompat);
  app.use('/api/v1/withdrawals', require('./routes/v1.withdrawals'));
  app.use('/api/v1/withdrawals', tokenCompat.withdrawalsCompat);
  app.use('/api/v1/pay2crypto-webhook', rateLimit({ windowMs: 60_000, max: 60 }), require('./routes/v1.pay2crypto-webhook'));

  // Minimal OpenAPI stub listing all versioned paths
  app.get('/api/v1/openapi.json', (_req, res) => res.json({
    openapi: '3.0.0',
    info: { title: 'TOCKINAX API', version: '1.0.0' },
    paths: {
      '/api/v1/auth': {}, '/api/v1/marketplace': {}, '/api/v1/referrals': {},
      '/api/v1/rewards': {}, '/api/v1/payouts': {}, '/api/v1/admin': {},
      '/api/v1/disputes': {}, '/api/v1/support': {}, '/api/v1/content': {},
      '/api/v1/users': {}, '/api/v1/webhooks': {}, '/api/v1/finance': {},
      '/api/v1/tokens': {}, '/api/v1/tokenmarket': {}, '/api/v1/deposits': {},
      '/api/v1/withdrawals': {}, '/api/v1/pay2crypto-webhook': { note: 'signed provider callbacks only' },
      '/api/v1/crypto': { note: '403 crypto_disabled' },
    },
  }));

  // Crypto routes stay locked until flag + legal approval
  app.use('/api/v1/crypto', (_req, res) => res.status(403).json({ error: 'crypto_disabled', message: 'USDT/crypto transfers are disabled until provider, network, legal and ops approvals are complete.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err && err.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_input', issues: process.env.NODE_ENV === 'production' ? undefined : err.issues });
    }
    console.error('[api error]', err.message);
    res.status(err.status || 500).json({ error: err.code || 'internal', message: process.env.NODE_ENV === 'production' ? 'internal error' : err.message });
  });
  return app;
}
module.exports = { buildApp };
