const { validateKey, mintLicenseKey } = require('./license-key');

const mem = new Map();
let blobStore = null;
let blobInitError = null;

function isNetlifyRuntime() {
  return process.env.NETLIFY === 'true' || Boolean(process.env.SITE_ID);
}

function configureStore(event) {
  try {
    const { connectLambda, getStore } = require('@netlify/blobs');
    if (event) connectLambda(event);
    blobStore = getStore('specter-licenses');
    blobInitError = null;
  } catch (e) {
    blobStore = null;
    blobInitError = e;
    console.error('[license-store] Netlify Blobs unavailable:', e.message);
    if (isNetlifyRuntime()) throw e;
  }
}

function getBlobStore() {
  if (!blobStore && !blobInitError) configureStore();
  return blobStore;
}

function handleStorageError(action, err) {
  console.error(`[license-store] ${action} failed:`, err.message);
  if (isNetlifyRuntime()) {
    throw err;
  }
}

function normKey(key) {
  return String(key || '').trim().toUpperCase();
}

async function getRecord(key) {
  const norm = normKey(key);
  const store = getBlobStore();
  if (store) {
    try {
      return await store.get(norm, { type: 'json' });
    } catch (e) {
      handleStorageError('getRecord', e);
    }
  }
  return mem.get(norm) || null;
}

async function saveRecord(key, record) {
  const norm = normKey(key);
  const store = getBlobStore();
  if (store) {
    try {
      await store.setJSON(norm, record);
      return record;
    } catch (e) {
      handleStorageError('saveRecord', e);
    }
  }
  mem.set(norm, record);
  return record;
}

async function listRecords() {
  const store = getBlobStore();
  if (store) {
    try {
      const { blobs } = await store.list();
      const out = [];
      for (const blob of blobs || []) {
        const r = await store.get(blob.key, { type: 'json' });
        if (r) out.push(r);
      }
      return out.sort((a, b) => new Date(b.purchasedAt || b.createdAt || 0) - new Date(a.purchasedAt || a.createdAt || 0));
    } catch (e) {
      handleStorageError('listRecords', e);
    }
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

module.exports = { configureStore, getRecord, saveRecord, listRecords, mintAndSave, getStats, validateKey };
