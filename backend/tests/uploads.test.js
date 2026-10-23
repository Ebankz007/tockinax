// Hermetic upload-guard tests (no DB): magic-byte sniff + middleware allow/deny.
const { sniffKind, evidenceUpload, MAX_BYTES } = require('../src/middleware/upload');

function fakeRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

describe('upload guards (offline)', () => {
  test('sniffKind detects png/jpeg/pdf, rejects text', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(sniffKind(png)).toBe('image/png');
    expect(sniffKind(jpg)).toBe('image/jpeg');
    expect(sniffKind(pdf)).toBe('application/pdf');
    expect(sniffKind(Buffer.from('hello world, this is not an image'))).toBe('unknown');
  });

  test('middleware allows png bytes, denies text bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    let nexted = false;
    const req = { body: png, headers: { 'content-type': 'image/png' } };
    evidenceUpload()({ ...req }, fakeRes(), () => { nexted = true; });
    expect(nexted).toBe(true);

    const res2 = fakeRes();
    let nexted2 = false;
    evidenceUpload()({ body: Buffer.from('fake receipt screenshot lol'), headers: { 'content-type': 'text/plain' } }, res2, () => { nexted2 = true; });
    expect(nexted2).toBe(false);
    expect(res2.statusCode).toBe(400);
    expect(res2.body.error).toMatch(/file_type_denied|mime_mismatch/);
  });

  test('middleware mime mismatch rejected; empty body passes when optional, 400 when required', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = fakeRes();
    let n = false;
    evidenceUpload()({ body: png, headers: { 'content-type': 'image/jpeg' } }, res, () => { n = true; });
    expect(n).toBe(false);
    expect(res.statusCode).toBe(400);

    const res2 = fakeRes();
    let n2 = false;
    evidenceUpload()({ body: Buffer.alloc(0), headers: {} }, res2, () => { n2 = true; });
    expect(n2).toBe(true);

    const res3 = fakeRes();
    let n3 = false;
    evidenceUpload({ required: true })({ body: Buffer.alloc(0), headers: {} }, res3, () => { n3 = true; });
    expect(n3).toBe(false);
    expect(res3.statusCode).toBe(400);
    expect(MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});
