const crypto = require('crypto');

const mem = new Map();
let blobStore = null;
let blobInitError = null;

function isNetlifyRuntime() {
  return process.env.NETLIFY === 'true' || Boolean(process.env.SITE_ID);
}

// Mirror the proven ticket-store.js pattern: connectLambda(event) MUST run
// (per request) before getStore() works in the Netlify Functions runtime.
function configureStore(event) {
  try {
    const { connectLambda, getStore } = require('@netlify/blobs');
    if (event) connectLambda(event);
    blobStore = getStore('specter-analytics');
    blobInitError = null;
  } catch (e) {
    blobStore = null;
    blobInitError = e;
    console.error('[analytics-store] Netlify Blobs unavailable:', e.message);
    if (isNetlifyRuntime()) throw e;
  }
}

function getBlobStore() {
  if (!blobStore && !blobInitError) configureStore();
  return blobStore;
}

// A robust UTC date incrementer to get all dates between startStr and endStr inclusive.
function getDatesInRange(startStr, endStr) {
  const dates = [];
  const startParts = startStr.split('-').map(Number);
  const endParts = endStr.split('-').map(Number);
  
  const start = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
  const end = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
  
  let current = new Date(start);
  let limit = 0;
  while (current <= end && limit < 366) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
    limit++;
  }
  return dates;
}

async function recordEvent(eventObj) {
  const store = getBlobStore();
  const ts = eventObj.ts || new Date().toISOString();
  const dateStr = ts.slice(0, 10);
  const rand = crypto.randomBytes(3).toString('hex');
  const safeTs = ts.replace(/:/g, '-');
  const key = `evt/${dateStr}/${safeTs}-${rand}`;
  
  if (store) {
    await store.setJSON(key, eventObj);
    return eventObj;
  }
  
  mem.set(key, eventObj);
  return eventObj;
}

async function listEventsInRange(startDateISO, endDateISO) {
  const store = getBlobStore();
  if (store) {
    const dates = getDatesInRange(startDateISO, endDateISO);
    const out = [];
    for (const d of dates) {
      let cursor = null;
      do {
        const listOpts = { prefix: `evt/${d}/` };
        if (cursor) listOpts.cursor = cursor;
        const res = await store.list(listOpts);
        const blobs = res.blobs || [];
        for (const blob of blobs) {
          const evt = await store.get(blob.key, { type: 'json' });
          if (evt) out.push(evt);
        }
        cursor = res.cursor;
      } while (cursor);
    }
    return out;
  }
  
  // In-memory fallback
  const out = [];
  for (const [key, val] of mem.entries()) {
    if (key.startsWith('evt/')) {
      const parts = key.split('/');
      if (parts.length >= 3) {
        const keyDate = parts[1];
        if (keyDate >= startDateISO && keyDate <= endDateISO) {
          out.push(val);
        }
      }
    }
  }
  return out;
}

module.exports = {
  configureStore,
  recordEvent,
  listEventsInRange,
  getDatesInRange,
};
