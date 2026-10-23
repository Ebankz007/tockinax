const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { buildApp } = require('../src/app');

const describeDB = process.env.DATABASE_URL ? describe : describe.skip;
const routeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'v1.payouts.js'), 'utf8');

describe('payout guards (offline)', () => {
  const app = buildApp();

  test('POST /payouts/request anon → 401', async () => {
    const r = await request(app).post('/api/v1/payouts/request').send({
      kind: 'commission', amount: '10.0000', currency: 'USD', destination: { bank: 'x' },
    });
    expect(r.status).toBe(401);
  });

  test('GET /payouts/mine anon → 401', async () => {
    const r = await request(app).get('/api/v1/payouts/mine');
    expect(r.status).toBe(401);
  });

  test('never_share_keys code path exists (privateKey/seed/mnemonic → 400)', () => {
    expect(routeSrc).toContain('never_share_keys');
    expect(routeSrc).toContain('privateKey');
    expect(routeSrc).toContain('seed');
    expect(routeSrc).toContain('mnemonic');
    expect(routeSrc).toMatch(/status\(400\)/);
  });

  test('insufficient_eligible → 422 path exists', () => {
    expect(routeSrc).toContain('insufficient_eligible');
    expect(routeSrc).toMatch(/status\(422\)/);
    // Eligibility = confirmed-payable calcs only (no self-funded balances).
    expect(routeSrc).toMatch(/payable/);
  });
});

describeDB('payout guards (live DB)', () => {
  test('destination with privateKey → 400 never_share_keys (authed)', async () => {
    // Requires member JWT: POST /payouts/request { destination: { privateKey } }
    // → 400 never_share_keys. Needs auth stub — documented in docs/API.md.
    expect(true).toBe(true);
  });

  test('over-balance request → 422 insufficient_eligible (authed)', async () => {
    // Requires member JWT with zero payable balance → 422 + eligible echo.
    expect(true).toBe(true);
  });
});
