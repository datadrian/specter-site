const { validateKey, mintLicenseKey } = require('./license-key');

const mem = new Map();
let blobStore = null;

try {
  const { getStore } = require('@netlify/blobs');
  blobStore = getStore({ name: 'specter-licenses', consistency: 'strong' });
} catch (_) {}

function normKey(key) {
  return String(key || '').trim().toUpperCase();
}

async function getRecord(key) {
  const norm = normKey(key);
  if (blobStore) return blobStore.get(norm, { type: 'json' });
  return mem.get(norm) || null;
}

async function saveRecord(key, record) {
  const norm = normKey(key);
  if (blobStore) {
    await blobStore.setJSON(norm, record);
    return record;
  }
  mem.set(norm, record);
  return record;
}

async function listRecords() {
  if (blobStore) {
    const { blobs } = await blobStore.list();
    const out = [];
    for (const blob of blobs || []) {
      const r = await blobStore.get(blob.key, { type: 'json' });
      if (r) out.push(r);
    }
    return out.sort((a, b) => new Date(b.purchasedAt || b.createdAt || 0) - new Date(a.purchasedAt || a.createdAt || 0));
  }
  return Array.from(mem.values()).sort((a, b) => new Date(b.purchasedAt || 0) - new Date(a.purchasedAt || 0));
}

async function mintAndSave({ email, type, note, stripeSessionId }) {
  const key = mintLicenseKey(process.env.LICENSE_SALT);
  const record = {
    key,
    email: String(email || '').trim().toLowerCase() || null,
    machineId: null,
    type: type || 'retail',
    note: note || null,
    purchasedAt: new Date().toISOString(),
    activatedAt: null,
    stripeSessionId: stripeSessionId || null,
  };
  await saveRecord(key, record);
  return record;
}

async function getStats() {
  const all = await listRecords();
  return {
    total: all.length,
    activated: all.filter(r => r.machineId).length,
    unactivated: all.filter(r => !r.machineId).length,
    retail: all.filter(r => (r.type || 'retail') === 'retail').length,
    comp: all.filter(r => r.type === 'comp').length,
    dev: all.filter(r => r.type === 'dev').length,
  };
}

module.exports = { getRecord, saveRecord, listRecords, mintAndSave, getStats, validateKey };
