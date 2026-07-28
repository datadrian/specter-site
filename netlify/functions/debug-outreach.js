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
    const withPrefix = await store.list({ prefix: 'community:' });
    const oneGet = all.blobs && all.blobs[0] ? await store.get(all.blobs[0].key, { type: 'json' }) : null;
    return json(200, {
      ok: true,
      allCount: (all.blobs || []).length,
      prefixCount: (withPrefix.blobs || []).length,
      firstKey: all.blobs && all.blobs[0] ? all.blobs[0].key : null,
      oneGetWorked: Boolean(oneGet),
      oneGetSample: oneGet ? { name: oneGet.name, status: oneGet.status } : null,
    });
  } catch (e) {
    return json(500, { ok: false, error: e.message, stack: e.stack });
  }
};
