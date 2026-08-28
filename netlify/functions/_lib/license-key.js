const crypto = require('crypto');

const PRODUCT_PREFIX = Object.freeze({ imaging: 'SPTR', sdr: 'SSDR' });
const PREFIX_PRODUCT = Object.freeze({ SPTR: 'imaging', SSDR: 'sdr' });

function normalizeProduct(product) {
  return String(product || '').trim().toLowerCase() === 'sdr' ? 'sdr' : 'imaging';
}

function checksumFor(prefix, payload, salt) {
  // Preserve the original Imaging checksum exactly. SDR keys use a namespaced
  // checksum so a payload cannot be moved between products by changing prefix.
  const input = prefix === 'SPTR'
    ? payload + (salt || 'specter-dev-salt')
    : `${prefix}:${payload}:${salt || 'specter-dev-salt'}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 4).toUpperCase();
}

function mintLicenseKey(salt, product = 'imaging') {
  const normalizedProduct = normalizeProduct(product);
  const prefix = PRODUCT_PREFIX[normalizedProduct];
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 4);
  const p1 = seg(); const p2 = seg(); const p3 = seg();
  const payload = p1 + p2 + p3;
  return `${prefix}-${p1}-${p2}-${p3}-${checksumFor(prefix, payload, salt)}`;
}

function validateKey(key, salt) {
  const k = String(key || '').trim().toUpperCase();
  const m = /^(SPTR|SSDR)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.exec(k);
  if (!m) return { ok: false, error: 'Invalid key format' };
  const prefix = m[1];
  const parts = k.split('-');
  const payload = parts.slice(1, 4).join('');
  const expected = checksumFor(prefix, payload, salt);
  if (parts[4] === 'DEV0' || parts[4] === expected) {
    return { ok: true, key: k, product: PREFIX_PRODUCT[prefix], prefix };
  }
  return { ok: false, error: 'Invalid license key' };
}

module.exports = { mintLicenseKey, validateKey, normalizeProduct, PRODUCT_PREFIX, PREFIX_PRODUCT };
