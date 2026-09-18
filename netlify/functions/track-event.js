const { json, corsPreflight, readJson } = require('./_lib/http');
const { configureStore, recordEvent } = require('./_lib/analytics-store');
const publicPaths = require('./_lib/analytics-public-paths.json');

// Anonymous usage counts only. Never copy arbitrary client fields or request headers into storage.
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const headers = event.headers || {};
  if (headers['sec-gpc'] === '1' || headers['dnt'] === '1') return json(200, { ok: true, skipped: 'Privacy preference' });
  const body = readJson(event);
  if (!['pageview', 'download'].includes(body.type)) return json(200, { ok: true, skipped: 'Unsupported counter type' });
  const site = event.analyticsSite === 'sdr' ? 'sdr' : 'imaging';
  if (typeof body.path !== 'string') return json(200, { ok: true, skipped: 'Invalid page' });
  const path = body.path.split(/[?#]/, 1)[0];
  if (!publicPaths[site].includes(path)) return json(200, { ok: true, skipped: 'Unknown public page' });
  try {
    configureStore(event);
    const date = new Date().toISOString().slice(0, 10);
    await recordEvent({ site, type: body.type, path, ts: date + 'T00:00:00.000Z', anonymous: true });
    return json(200, { ok: true });
  } catch (error) {
    // Do not log bodies, IP addresses, cookies, user agents, or incoming URLs.
    console.error('[track-event] Anonymous counter storage unavailable');
    return json(503, { ok: false, error: 'Counter storage unavailable' });
  }
};
