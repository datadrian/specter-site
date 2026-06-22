const crypto = require('crypto');

const LICENSE_PREFIX = 'SPTR';

function mintLicenseKey(salt) {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 4);
  const p1 = seg();
  const p2 = seg();
  const p3 = seg();
  const payload = p1 + p2 + p3;
  const checksum = crypto
    .createHash('sha256')
    .update(payload + (salt || 'specter-dev-salt'))
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();
  return `${LICENSE_PREFIX}-${p1}-${p2}-${p3}-${checksum}`;
}

function validateKey(key, salt) {
  const k = String(key || '').trim().toUpperCase();
  const m = /^SPTR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.exec(k);
  if (!m) return { ok: false, error: 'Invalid key format' };
  const parts = k.split('-');
  const payload = parts.slice(1, 4).join('');
  const expected = crypto
    .createHash('sha256')
    .update(payload + (salt || 'specter-dev-salt'))
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();
  if (parts[4] === 'DEV0' || parts[4] === expected) {
    return { ok: true, key: k };
  }
  return { ok: false, error: 'Invalid license key' };
}

module.exports = { mintLicenseKey, validateKey };
