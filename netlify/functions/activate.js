const { validateKey } = require('./_lib/license-key');
const { getRecord, saveRecord } = require('./_lib/license-store');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) {}

  const key = String(body.key || '').trim().toUpperCase();
  const email = String(body.email || '').trim().toLowerCase();
  const machineId = String(body.machineId || '').trim();

  if (!key || !machineId) {
    return json(400, { ok: false, error: 'Key and machine ID are required.' });
  }

  const fmt = validateKey(key, process.env.LICENSE_SALT);
  if (!fmt.ok) return json(200, { ok: false, error: fmt.error });

  let record = await getRecord(fmt.key);
  if (!record) {
    return json(200, { ok: false, error: 'License key not found. Check the key from your purchase email.' });
  }

  if (record.email && email && record.email.toLowerCase() !== email) {
    return json(200, { ok: false, error: 'Email does not match this license.' });
  }

  if (record.machineId && record.machineId !== machineId) {
    return json(200, {
      ok: false,
      error: 'This license is already activated on another computer.',
    });
  }

  record = {
    ...record,
    key: fmt.key,
    machineId,
    activatedAt: record.activatedAt || new Date().toISOString(),
    email: record.email || email,
  };
  await saveRecord(fmt.key, record);

  return json(200, { ok: true, plan: 'standard', expiresAt: null });
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
