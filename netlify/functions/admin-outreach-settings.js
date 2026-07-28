// admin-outreach-settings.js — outreach-wide settings, currently just the
// auto-poster kill switch (autoPostPaused). This is checked server-side by
// admin-outreach-ready-to-post.js, so flipping it is an ACTUAL stop, not a
// cosmetic UI flag — it takes effect on the very next queue check regardless
// of what the scheduled agent step is doing.
const { json, corsPreflight, readJson } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, getSettings, updateSettings } = require('./_lib/outreach-store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);

  if (event.httpMethod === 'GET') {
    const settings = await getSettings();
    return json(200, { ok: true, settings });
  }

  if (event.httpMethod === 'PATCH') {
    const body = readJson(event);
    const settings = await updateSettings(body);
    return json(200, { ok: true, settings });
  }

  return json(405, { error: 'Method not allowed' });
};
