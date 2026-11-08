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

// Community media limits are separate from the 5MB evidence guard. The route
// passes the admin-configured limits; these are the defaults when it does not.
const MEDIA_DEFAULTS = {
  image: 8 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  any: 50 * 1024 * 1024,
};
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime']);
const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR';

// Magic bytes: PNG 89 50 4E 47 0D 0A 1A 0A | JPEG FF D8 FF | PDF 25 50 44 46
// WebP: RIFF....WEBP | ISO-BMFF (MP4/MOV): ....ftyp<brand>
function sniffKind(buf) {
  if (!buf || buf.length < 4) return 'unknown';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF'
    && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  // ISO-BMFF ftyp box: bytes 4-8 are 'ftyp', bytes 8-12 are the brand.
  // Detect at the root level regardless of declared box size (some fixtures
  // are shorter than the size field claims).
  if (buf.length >= 10 && buf.toString('latin1', 4, 8) === 'ftyp') {
    const brand = buf.toString('latin1', 8, Math.min(12, buf.length));
    return brand.startsWith('qt') ? 'video/quicktime' : 'video/mp4';
  }
  return 'unknown';
}

// Best-effort MP4/MOV duration read from the mvhd box. Returns null when the
// box is not present in the bytes we have (the client can then still upload;
// the admin sees "duration unknown" rather than a fabricated number).
function mp4DurationSeconds(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null;
  try {
    const walk = (start, end, depth) => {
      let off = start;
      while (off + 8 <= end && depth < 4) {
        let size = buf.readUInt32BE(off);
        const type = buf.toString('latin1', off + 4, off + 8);
        let header = 8;
        if (size === 1) {
          if (off + 16 > end) return null;
          const hi = buf.readUInt32BE(off + 8);
          const lo = buf.readUInt32BE(off + 12);
          size = hi * 4294967296 + lo;
          header = 16;
        } else if (size === 0) {
          size = end - off;
        }
        if (size < header || off + size > end) return null;
        const payload = off + header;
        if (type === 'moov') {
          const r = walk(payload, off + size, depth + 1);
          if (r !== null) return r;
        } else if (type === 'mvhd') {
          const version = buf[payload];
          if (version === 1) {
            if (payload + 32 > off + size) return null;
            const timescale = buf.readUInt32BE(payload + 20);
            const durHi = buf.readUInt32BE(payload + 24);
            const durLo = buf.readUInt32BE(payload + 28);
            const duration = durHi * 4294967296 + durLo;
            return timescale > 0 ? duration / timescale : null;
          }
          if (payload + 20 > off + size) return null;
          const timescale = buf.readUInt32BE(payload + 12);
          const duration = buf.readUInt32BE(payload + 16);
          return timescale > 0 ? duration / timescale : null;
        }
        off += size;
      }
      return null;
    };
    return walk(0, buf.length, 0);
  } catch {
    return null;
  }
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

function safeDecode(value) {
  try { return value ? decodeURIComponent(String(value)) : null; } catch { return null; }
}

// Community testimonial/social media guard. The caller supplies the configured
// limits (admin-editable). File type is decided by magic bytes only; the
// declared content-type must agree. An EICAR payload is rejected as malware.
function mediaUpload({ required = false, kind = 'any', maxBytes, maxVideoSeconds } = {}) {
  const allowed = kind === 'image' ? IMAGE_MIME : kind === 'video' ? VIDEO_MIME : new Set([...IMAGE_MIME, ...VIDEO_MIME]);
  const cap = Number(maxBytes) > 0 ? Number(maxBytes) : MEDIA_DEFAULTS[kind] || MEDIA_DEFAULTS.any;
  return (req, res, next) => {
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : null;
      if (!buf || buf.length === 0) {
        if (required) return res.status(400).json({ error: 'file_required' });
        req.fileCheck = { present: false };
        return next();
      }
      if (buf.length > cap) {
        return res.status(413).json({ error: 'file_too_large', maxBytes: cap });
      }
      if (buf.includes(Buffer.from(EICAR_SIGNATURE))) {
        return res.status(400).json({ error: 'malware_detected' });
      }
      const declared = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const sniffed = sniffKind(buf.subarray(0, 32));
      if (sniffed === 'unknown' || !allowed.has(sniffed)) {
        return res.status(400).json({
          error: 'file_type_denied',
          message: kind === 'image' ? 'Only png/jpg/webp images are allowed.'
            : kind === 'video' ? 'Only mp4/mov videos are allowed.'
              : 'Only png/jpg/webp images and mp4/mov videos are allowed.',
        });
      }
      if (declared && declared !== '*/*' && declared !== 'application/octet-stream' && declared !== sniffed) {
        return res.status(400).json({ error: 'mime_mismatch', declared, sniffed });
      }
      let durationSeconds = null;
      if (sniffed === 'video/mp4' || sniffed === 'video/quicktime') {
        durationSeconds = mp4DurationSeconds(buf);
        const limit = Number(maxVideoSeconds) > 0 ? Number(maxVideoSeconds) : 0;
        if (limit > 0 && durationSeconds !== null && durationSeconds > limit + 0.5) {
          return res.status(400).json({ error: 'video_too_long', maxSeconds: limit, durationSeconds });
        }
      }
      req.fileCheck = {
        present: true,
        kind: sniffed,
        bytes: buf.length,
        durationSeconds,
        originalName: safeDecode(req.headers['x-file-name']),
      };
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

module.exports = {
  evidenceUpload, mediaUpload, sniffKind, mp4DurationSeconds,
  MAX_BYTES, ALLOWED_MIME, MEDIA_DEFAULTS, IMAGE_MIME, VIDEO_MIME,
};
