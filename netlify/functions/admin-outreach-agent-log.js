// admin-outreach-agent-log.js — backs the "what's the agent doing" console
// widget in the admin header. The auto-poster (a scheduled agent step running
// browser automation, not a Netlify function) POSTs a line here at each key
// step of a run; the console GETs recent lines and polls for a live feel.
const { json, corsPreflight, readJson } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, appendAgentLog, listAgentLog } = require('./_lib/outreach-store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);

  if (event.httpMethod === 'GET') {
    const limit = Number(event.queryStringParameters?.limit) || 50;
    const entries = await listAgentLog(limit);
    return json(200, { ok: true, entries });
  }

  if (event.httpMethod === 'POST') {
    const body = readJson(event);
    if (!body.message) return json(400, { ok: false, error: 'message is required.' });
    const entry = await appendAgentLog(body.level || 'info', body.message);
    return json(200, { ok: true, entry });
  }

  return json(405, { error: 'Method not allowed' });
};
