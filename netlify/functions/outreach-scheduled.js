// outreach-scheduled.js — the weekly automatic pass: discover new
// communities, analyze rules for a small batch, draft posts for a small
// batch, and log a summary. Auto-posting is intentionally NOT invoked here
// yet — Phase 1 is discover+draft only; posting (even to the allow-list)
// stays a manual "mark as posted" action from the admin console until an
// auto-post executor is built and proven. Scheduled via netlify.toml
// ([functions."outreach-scheduled"] schedule = "@weekly").
//
// Guarded so this can't be triggered by an arbitrary public request: only
// runs if Netlify's own scheduler invoked it (body carries "next_run") or if
// called with a valid admin bearer token (so Adrian can trigger it manually
// too, e.g. via curl, without needing the console).
const { json } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, listCommunities, listDrafts } = require('./_lib/outreach-store');
const { discoverCommunities, analyzeCommunity, draftForCommunity } = require('./_lib/outreach-engine');

const BATCH_SIZE = 3;
// analyze runs 2 LLM calls per community now (rules + the search-grounded
// activity check) instead of 1 — use a smaller batch here since this function
// already does discover+analyze+draft in one invocation and needs headroom.
const ANALYZE_BATCH_SIZE = 2;

function readJsonSafe(event) {
  try { return JSON.parse(event.body || '{}'); } catch { return {}; }
}

exports.handler = async (event) => {
  const body = readJsonSafe(event);
  const isScheduledInvocation = Boolean(body.next_run);
  if (!isScheduledInvocation) {
    const auth = requireAdmin(event);
    if (!auth.authorized) return json(401, { ok: false, error: 'Not authorized to trigger this run.' });
  }

  configureStore(event);
  const summary = { discovered: 0, analyzed: 0, drafted: 0, errors: [] };

  try {
    const disc = await discoverCommunities();
    summary.discovered = disc.created.length;
    summary.errors.push(...disc.errors);
  } catch (e) { summary.errors.push(`discover: ${e.message}`); }

  try {
    const communities = await listCommunities();
    const batch = communities.filter(c => c.status === 'discovered').slice(0, ANALYZE_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(c => analyzeCommunity(c)));
    summary.analyzed = results.filter(r => r.status === 'fulfilled').length;
    results.filter(r => r.status === 'rejected').forEach(r => summary.errors.push(`analyze: ${r.reason?.message || r.reason}`));
  } catch (e) { summary.errors.push(`analyze: ${e.message}`); }

  try {
    const [communities, drafts] = await Promise.all([listCommunities(), listDrafts()]);
    const hasDraft = new Set(drafts.map(d => d.communityId));
    const candidates = communities.filter(c => (c.status === 'needs_review' || c.status === 'vetted_allowlisted') && !hasDraft.has(c.id));
    const batch = candidates.slice(0, BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(c => draftForCommunity(c)));
    summary.drafted = results.filter(r => r.status === 'fulfilled').length;
    results.filter(r => r.status === 'rejected').forEach(r => summary.errors.push(`draft: ${r.reason?.message || r.reason}`));
  } catch (e) { summary.errors.push(`draft: ${e.message}`); }

  console.log('[outreach-scheduled] weekly run summary:', JSON.stringify(summary));
  return json(200, { ok: true, summary });
};
