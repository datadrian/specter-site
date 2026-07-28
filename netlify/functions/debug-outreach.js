const { json, corsPreflight } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  try {
    const { connectLambda, getStore } = require('@netlify/blobs');
    connectLambda(event);
    const store = getStore('specter-outreach');
    const listed = await store.list();
    return json(200, { ok: true, blobCount: (listed.blobs || []).length, keys: (listed.blobs || []).map(b => b.key).slice(0, 30) });
  } catch (e) {
    return json(500, { ok: false, error: e.message, stack: e.stack });
  }
};
