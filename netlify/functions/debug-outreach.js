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
    const all = await store.list();
    const postlogKeys = (all.blobs || []).filter(b => b.key.startsWith('postlog:'));
    return json(200, { ok: true, totalKeys: (all.blobs||[]).length, allKeys: (all.blobs||[]).map(b=>b.key), postlogKeys: postlogKeys.map(b=>b.key) });
  } catch (e) {
    return json(500, { ok: false, error: e.message, stack: e.stack });
  }
};
