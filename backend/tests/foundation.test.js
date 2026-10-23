const request = require('supertest');
const { buildApp } = require('../src/app');

describe('TOCKINAX foundation guards', () => {
  const app = buildApp();
  test('healthz ok', async () => {
    const r = await request(app).get('/healthz');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
  test('crypto locked by default', async () => {
    const r = await request(app).get('/api/v1/crypto/status');
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('crypto_disabled');
  });
  test('registration validates input', async () => {
    const r = await request(app).post('/api/v1/auth/register').send({ email: 'not-an-email', password: 'short', acceptTerms: false });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
