// admin-outreach-postlog.js — read-only audit trail of every post recorded
// (manual today; auto once a posting executor is wired in). Lets Adrian see
// exactly what went out where and when if a community's mods ever push back.
const { json, corsPreflight } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, listPostLog } = require('./_lib/outreach-store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);

  const entries = await listPostLog();
  return json(200, { ok: true, entries });
};
