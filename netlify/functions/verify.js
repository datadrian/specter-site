const { validateKey } = require('./_lib/license-key');
const { configureStore, getRecord } = require('./_lib/license-store');
const { json, corsPreflight, readJson } = require('./_lib/http');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }
  configureStore(event);

  const body = readJson(event);

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
