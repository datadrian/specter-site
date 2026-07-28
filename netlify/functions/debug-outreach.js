const { json, corsPreflight } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, listPostLog } = require('./_lib/outreach-store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  try {
    configureStore(event);
    const { connectLambda, getStore } = require('@netlify/blobs');
    connectLambda(event);
    const store = getStore('specter-outreach');
    const withPrefix = await store.list({ prefix: 'postlog:' });
    const directGet = await store.get('postlog:pl_ms4dwk0j974a70', { type: 'json' });
    const viaLib = await listPostLog();
    return json(200, {
      ok: true,
      prefixListCount: (withPrefix.blobs || []).length,
      prefixListKeys: (withPrefix.blobs || []).map(b => b.key),
      directGetWorked: Boolean(directGet),
      directGetSample: directGet,
      viaLibCount: viaLib.length,
      viaLibSample: viaLib[0] || null,
    });
  } catch (e) {
    return json(500, { ok: false, error: e.message, stack: e.stack });
  }
};
