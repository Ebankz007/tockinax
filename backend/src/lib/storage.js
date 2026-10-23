// Local evidence storage — private disk only, never public URLs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function storageDir() {
  return process.env.STORAGE_DIR || path.join(__dirname, '..', '..', 'uploads-private');
}

async function saveEvidence(buffer, ext) {
  const dir = storageDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const safeExt = String(ext || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  const name = `${crypto.randomUUID()}.${safeExt}`;
  await fs.promises.writeFile(path.join(dir, name), buffer);
  return name; // storageKey
}

function signedUrl(storageKey) {
  // Dev: local file path. Production should swap for time-boxed signed URLs.
  return path.join(storageDir(), storageKey);
}

module.exports = { saveEvidence, signedUrl, storageDir };
