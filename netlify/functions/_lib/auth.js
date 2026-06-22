const crypto = require('crypto');
const { json } = require('./http');

function getBearerToken(event) {
  const h = event.headers?.authorization || event.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : '';
}

function verifyAdminToken(event) {
  const expected = process.env.ADMIN_API_TOKEN || '';
  if (!expected) return { ok: false, error: 'Admin API not configured.' };
  const got = getBearerToken(event);
  if (!got) return { ok: false, error: 'Missing authorization token.' };
  try {
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'Invalid token.' };
    }
  } catch {
    return { ok: false, error: 'Invalid token.' };
  }
  return { ok: true };
}

function requireAdmin(event) {
  const auth = verifyAdminToken(event);
  if (!auth.ok) return { authorized: false, response: json(401, auth) };
  return { authorized: true };
}

function verifyAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  try {
    const a = Buffer.from(String(password || ''));
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = { verifyAdminToken, requireAdmin, verifyAdminPassword, getBearerToken };
