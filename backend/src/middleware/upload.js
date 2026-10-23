// Evidence/attachment upload guard — multer-free on purpose (no new dep).
// Enforces: 5MB body cap, mime allowlist (png/jpg/pdf), magic-byte sniff of first 8 bytes.
// Wiring (see README snippet): memory-buffer the single file field, run checks here,
// then persist to private storage (local disk dev / S3 prod) — never serve publicly.
//
// const { evidenceUpload } = require('../middleware/upload');
// router.post('/orders/:id/evidence',
//   express.raw({ type: '*/*', limit: '5mb' }),
//   evidenceUpload({ field: 'file', required: false }),
//   handler)
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'application/pdf']);

// Magic bytes (first 8): PNG 89 50 4E 47 0D 0A 1A 0A | JPEG FF D8 FF | PDF 25 50 44 46
function sniffKind(buf) {
  if (!buf || buf.length < 4) return 'unknown';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  return 'unknown';
}

function evidenceUpload({ required = false } = {}) {
  return (req, res, next) => {
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : null;
      if (!buf || buf.length === 0) {
        if (required) return res.status(400).json({ error: 'file_required' });
        req.fileCheck = { present: false };
        return next();
      }
      if (buf.length > MAX_BYTES) {
        return res.status(413).json({ error: 'file_too_large', maxBytes: MAX_BYTES });
      }
      const declared = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const kind = sniffKind(buf.subarray(0, 8));
      if (kind === 'unknown') {
        return res.status(400).json({ error: 'file_type_denied', message: 'Only png/jpg/pdf by magic bytes.' });
      }
      // Declared content-type must agree with sniffed bytes when it claims to be a file type.
      if (declared && declared !== '*/*' && declared !== 'application/octet-stream' && declared !== kind) {
        return res.status(400).json({ error: 'mime_mismatch', declared, sniffed: kind });
      }
      if (!ALLOWED_MIME.has(kind)) {
        return res.status(400).json({ error: 'file_type_denied' });
      }
      req.fileCheck = { present: true, kind, bytes: buf.length };
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

module.exports = { evidenceUpload, sniffKind, MAX_BYTES, ALLOWED_MIME };
