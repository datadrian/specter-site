// admin-outreach-run.js — triggers a batch of the discovery/analysis/drafting
// pipeline. Kept as small batches per call (not one giant "run everything")
// to stay well inside Netlify's function time limit — the admin console (or
// the weekly scheduled function) calls this repeatedly/step-by-step.
const { json, corsPreflight, readJson } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const {
  configureStore, listCommunities, listDrafts,
} = require('./_lib/outreach-store');
const { discoverCommunities, analyzeCommunity, draftForCommunity } = require('./_lib/outreach-engine');

const BATCH_SIZE = 3;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);

  const body = readJson(event);
  const action = body.action;

  try {
    if (action === 'discover') {
      const result = await discoverCommunities();
      return json(200, { ok: true, action, createdCount: result.created.length, skipped: result.skipped, errors: result.errors });
    }

    if (action === 'analyze') {
      const communities = await listCommunities();
      const batch = communities.filter(c => c.status === 'discovered').slice(0, BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(c => analyzeCommunity(c)));
      const okCount = results.filter(r => r.status === 'fulfilled').length;
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));
      return json(200, { ok: true, action, processed: batch.length, succeeded: okCount, remaining: communities.filter(c => c.status === 'discovered').length - batch.length, errors });
    }

    if (action === 'draft') {
      const [communities, drafts] = await Promise.all([listCommunities(), listDrafts()]);
      const hasDraft = new Set(drafts.map(d => d.communityId));
      const candidates = communities.filter(c => (c.status === 'needs_review' || c.status === 'vetted_allowlisted') && !hasDraft.has(c.id));
      const batch = candidates.slice(0, BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(c => draftForCommunity(c)));
      const okCount = results.filter(r => r.status === 'fulfilled').length;
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));
      return json(200, { ok: true, action, processed: batch.length, succeeded: okCount, remaining: candidates.length - batch.length, errors });
    }

    return json(400, { ok: false, error: 'action must be one of: discover, analyze, draft' });
  } catch (e) {
    console.error('[admin-outreach-run]', e);
    return json(500, { ok: false, error: e.message });
  }
};
