'use strict';
const assert = require('assert');
process.env.LICENSE_SALT = 'unit-test-salt';
delete process.env.NETLIFY; delete process.env.SITE_ID;

const { mintLicenseKey, validateKey } = require('../netlify/functions/_lib/license-key');
const store = require('../netlify/functions/_lib/license-store');
const activate = require('../netlify/functions/activate');
const { fulfillSession, purchaseProduct } = require('../netlify/functions/stripe-webhook');
const { PRODUCTS } = require('../netlify/functions/create-checkout');

(async () => {
  const imagingKey = mintLicenseKey(process.env.LICENSE_SALT, 'imaging');
  const sdrKey = mintLicenseKey(process.env.LICENSE_SALT, 'sdr');
  assert(/^SPTR-/.test(imagingKey)); assert(/^SSDR-/.test(sdrKey));
  assert.strictEqual(validateKey(imagingKey, process.env.LICENSE_SALT).product, 'imaging');
  assert.strictEqual(validateKey(sdrKey, process.env.LICENSE_SALT).product, 'sdr');
  assert.strictEqual(PRODUCTS.imaging.amount, 19900); assert.strictEqual(PRODUCTS.sdr.amount, 19900); assert.strictEqual(PRODUCTS.bundle.amount, 34900);
  assert.strictEqual(purchaseProduct('specter-bundle'), 'bundle');

  const sdrRecord = await store.mintAndSave({ email: 'buyer@example.com', type: 'retail', product: 'sdr' });
  let result = await activate.handler({ httpMethod: 'POST', body: JSON.stringify({ key: sdrRecord.key, email: 'buyer@example.com', machineId: 'machine-1', product: 'imaging' }), headers: {} });
  assert.strictEqual(JSON.parse(result.body).ok, false);
  result = await activate.handler({ httpMethod: 'POST', body: JSON.stringify({ key: sdrRecord.key, email: 'buyer@example.com', machineId: 'machine-1', product: 'sdr' }), headers: {} });
  assert.strictEqual(JSON.parse(result.body).ok, true);
  result = await activate.handler({ httpMethod: 'POST', body: JSON.stringify({ key: sdrRecord.key, email: 'buyer@example.com', machineId: 'machine-2', product: 'sdr' }), headers: {} });
  let body = JSON.parse(result.body); assert.strictEqual(body.ok, false); assert.strictEqual(body.code, 'BOUND_TO_ANOTHER_MACHINE'); assert.strictEqual(body.canTransfer, true);
  result = await activate.handler({ httpMethod: 'POST', body: JSON.stringify({ key: sdrRecord.key, email: 'wrong@example.com', machineId: 'machine-2', product: 'sdr', transfer: true }), headers: {} });
  assert.strictEqual(JSON.parse(result.body).ok, false);
  result = await activate.handler({ httpMethod: 'POST', body: JSON.stringify({ key: sdrRecord.key, email: 'buyer@example.com', machineId: 'machine-2', product: 'sdr', transfer: true }), headers: {} });
  body = JSON.parse(result.body); assert.strictEqual(body.ok, true);
  const transferred = await store.getRecord(sdrRecord.key); assert.strictEqual(transferred.machineId, 'machine-2'); assert.strictEqual(transferred.transferCount, 1); assert.strictEqual(transferred.previousMachineIds[0].machineId, 'machine-1');

  const session = { id: 'cs_bundle_test', customer_details: { email: '' }, metadata: { product: 'specter-bundle' } };
  const first = await fulfillSession(session);
  assert.deepStrictEqual(first.records.map(r => r.product).sort(), ['imaging', 'sdr']);
  const keys = first.records.map(r => r.key).sort();
  const second = await fulfillSession(session);
  assert.deepStrictEqual(second.records.map(r => r.key).sort(), keys);
  const all = await store.listRecords();
  assert.strictEqual(all.filter(r => r.stripeSessionId === session.id).length, 2);
  console.log('licensing tests PASS');
})().catch(error => { console.error(error); process.exit(1); });
