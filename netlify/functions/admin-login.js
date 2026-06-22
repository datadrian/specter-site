const { json, corsPreflight, readJson } = require('./_lib/http');
const { verifyAdminPassword } = require('./_lib/auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = readJson(event);
  if (!verifyAdminPassword(body.password)) {
    return json(401, { ok: false, error: 'Invalid password.' });
  }

  const token = process.env.ADMIN_API_TOKEN;
  if (!token) {
    return json(503, { ok: false, error: 'ADMIN_API_TOKEN not configured on Netlify.' });
  }

  return json(200, { ok: true, token });
};
