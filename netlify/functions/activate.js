const { validateKey, normalizeProduct } = require('./_lib/license-key');
const { configureStore, getRecord, saveRecord } = require('./_lib/license-store');
const { json, corsPreflight, readJson } = require('./_lib/http');

function productLabel(product) { return product === 'sdr' ? 'SPECTER SDR' : 'SPECTER Imaging'; }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  configureStore(event);
  const body = readJson(event);
  const key = String(body.key || '').trim().toUpperCase();
  const email = String(body.email || '').trim().toLowerCase();
  const machineId = String(body.machineId || '').trim();
  const requestedProduct = normalizeProduct(body.product || 'imaging');
  if (!key || !machineId) return json(400, { ok: false, error: 'Key and machine ID are required.' });

  const fmt = validateKey(key, process.env.LICENSE_SALT);
  if (!fmt.ok) return json(200, { ok: false, error: fmt.error });
  if (fmt.product !== requestedProduct) return json(200, { ok: false, error: `This key is for ${productLabel(fmt.product)}, not ${productLabel(requestedProduct)}.` });

  let record = await getRecord(fmt.key);
  if (!record) return json(200, { ok: false, error: 'License key not found. Check the key from your purchase email.' });
  const recordProduct = normalizeProduct(record.product || fmt.product);
  if (recordProduct !== requestedProduct) return json(200, { ok: false, error: `This key is for ${productLabel(recordProduct)}, not ${productLabel(requestedProduct)}.` });
  if (record.email && email && record.email.toLowerCase() !== email) return json(200, { ok: false, error: 'Email does not match this license.' });
  if (record.machineId && record.machineId !== machineId) return json(200, { ok: false, error: 'This license is already activated on another computer.' });

  record = { ...record, key: fmt.key, product: recordProduct, machineId, activatedAt: record.activatedAt || new Date().toISOString(), email: record.email || email };
  await saveRecord(fmt.key, record);
  return json(200, { ok: true, product: recordProduct, plan: 'standard', expiresAt: null });
};
