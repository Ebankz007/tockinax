const BASE = 'http://127.0.0.1:5070';
async function J(url, opts) {
  const r = await fetch(BASE + url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const t = await r.text();
  console.log(url + ' -> ' + r.status + ' ' + t.slice(0, 280));
  try { return JSON.parse(t); } catch { return {}; }
}
(async () => {
  const email = 'smoke' + Date.now() + '@test.com';
  const reg = await J('/api/v1/auth/register', { method: 'POST', body: JSON.stringify({ email, password: 'SuperSecure123!', acceptTerms: true }) });
  await J('/api/v1/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, token: reg.devVerifyToken }) });
  const login = await J('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'SuperSecure123!' }) });
  const H = { Authorization: 'Bearer ' + login.access };
  let r = await fetch(BASE + '/api/v1/referrals/me', { headers: H });
  console.log('/referrals/me -> ' + r.status + ' ' + (await r.text()).slice(0, 280));
  r = await fetch(BASE + '/api/v1/rewards/campaigns', { headers: H });
  console.log('/rewards -> ' + r.status + ' ' + (await r.text()).slice(0, 280));
  r = await fetch(BASE + '/api/v1/crypto/status');
  console.log('/crypto -> ' + r.status + ' ' + (await r.text()).slice(0, 160));
})().catch((e) => { console.log('SMOKE-ERR:' + e.message); process.exit(1); });
