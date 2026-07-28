// admin-outreach-communities.js — list/inspect communities, and let Adrian vet
// them: promote to vetted_allowlisted (optionally with auto_post_enabled), or
// reject. This is the ONLY path that can ever set status=vetted_allowlisted —
// the discovery/analysis engine never does this itself.
const { json, corsPreflight, readJson } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, listCommunities, getCommunity, updateCommunity } = require('./_lib/outreach-store');

const VALID_STATUS = ['discovered', 'needs_review', 'vetted_allowlisted', 'rejected'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);

  const id = event.queryStringParameters?.id;

  if (event.httpMethod === 'GET') {
    if (id) {
      const c = await getCommunity(id);
      if (!c) return json(404, { ok: false, error: 'Community not found.' });
      return json(200, { ok: true, community: c });
    }
    const communities = await listCommunities();
    return json(200, { ok: true, communities });
  }

  if (event.httpMethod === 'PATCH' && id) {
    const body = readJson(event);
    const patch = {};
    if (body.status) {
      if (!VALID_STATUS.includes(body.status)) return json(400, { ok: false, error: 'Invalid status.' });
      patch.status = body.status;
    }
    if (typeof body.autoPostEnabled === 'boolean') patch.autoPostEnabled = body.autoPostEnabled;
    if (typeof body.selfPromoNotes === 'string') patch.selfPromoNotes = body.selfPromoNotes;

    // Safety: auto_post_enabled can only ever be true alongside vetted_allowlisted.
    const current = await getCommunity(id);
    if (!current) return json(404, { ok: false, error: 'Community not found.' });
    const nextStatus = patch.status || current.status;
    if (patch.autoPostEnabled && nextStatus !== 'vetted_allowlisted') {
      return json(400, { ok: false, error: 'auto_post_enabled requires status=vetted_allowlisted.' });
    }
    if (patch.status && patch.status !== 'vetted_allowlisted' && current.autoPostEnabled) {
      patch.autoPostEnabled = false; // demoting out of allowlist always clears auto-post
    }

    const updated = await updateCommunity(id, patch);
    return json(200, { ok: true, community: updated });
  }

  return json(405, { error: 'Method not allowed' });
};
