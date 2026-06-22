const { validateKey } = require('./_lib/license-key');
const { getRecord } = require('./_lib/license-store');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) {}

  const fmt = validateKey(body.key, process.env.LICENSE_SALT);
  if (!fmt.ok) {
    return json(200, { ok: false, error: fmt.error });
  }

  const machineId = String(body.machineId || '').trim();
  const record = await getRecord(fmt.key);
  if (!record) {
    return json(200, { ok: false, error: 'License key not found.' });
  }
  if (record.machineId && machineId && record.machineId !== machineId) {
    return json(200, { ok: false, error: 'License bound to another machine.' });
  }

  return json(200, { ok: true, plan: 'standard', expiresAt: null });
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
