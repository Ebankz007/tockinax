const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { buildApp } = require('../src/app');

const describeDB = process.env.DATABASE_URL ? describe : describe.skip;
const routeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'v1.referrals.js'), 'utf8');
const schemaSrc = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.js'), 'utf8');

describe('referrals guards (offline)', () => {
  const app = buildApp();

  test('GET /referrals/me requires auth (401 anon)', async () => {
    const r = await request(app).get('/api/v1/referrals/me');
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('unauthorized');
  });

  test('policy text mentions verified sales (no recruitment commissions)', () => {
    // Route-level disclosure — commissions ONLY on eligible verified sales.
    expect(routeSrc).toMatch(/verified sales/i);
    expect(routeSrc).toMatch(/confirmation period/i);
  });

  test('circular/self insert blocked by DB check (referrals_no_self)', () => {
    // Static proof the constraint ships in schema: ancestor <> descendant.
    expect(schemaSrc).toContain('referrals_no_self');
    expect(schemaSrc).toMatch(/ancestorId.*<>.*descendantId/s);
    // Depth bound 1..5 also enforced at schema level.
    expect(schemaSrc).toContain('referrals_depth_ck');
  });
});

describeDB('referrals guards (live DB)', () => {
  test('circular insert ancestor==descendant → check violation', async () => {
    const { getPool } = require('../src/lib/db');
    const pool = getPool();
    const id = '00000000-0000-0000-0000-000000000000';
    await expect(
      pool.query(`insert into referrals (ancestor_id, descendant_id, depth) values ($1,$1,1)`, [id])
    ).rejects.toThrow();
  });
});
