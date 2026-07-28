// admin-outreach-run.js — triggers a batch of the discovery/analysis/drafting
// pipeline. Kept as small batches per call (not one giant "run everything")
// to stay well inside Netlify's function time limit — the admin console (or
// the weekly scheduled function) calls this repeatedly/step-by-step.
const { json, corsPreflight, readJson } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const {
  configureStore, listCommunities, listDrafts, updateDraft, getCommunity, deleteRecord,
} = require('./_lib/outreach-store');
const { discoverCommunities, analyzeCommunity, draftForCommunity, purgeEmDashFromDraft } = require('./_lib/outreach-engine');
const { scanForbiddenTerms, scanEmDash } = require('./_lib/outreach-compliance');

const BATCH_SIZE = 3;
// analyze now runs 2 LLM calls per community (rules analysis + the new
// search-grounded activity check) instead of 1, so a smaller batch keeps us
// well inside Netlify's function time limit even with both calls concurrent.
const ANALYZE_BATCH_SIZE = 2;

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
      const batch = communities.filter(c => c.status === 'discovered').slice(0, ANALYZE_BATCH_SIZE);
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

    if (action === 'purge_em_dashes') {
      // One-off migration for drafts written before the no-em-dash rule was added
      // (and a safety net for anything that slips through in the future).
      const drafts = await listDrafts();
      const affected = drafts.filter(d => /\u2014/.test(d.draftText || ''));
      const results = await Promise.allSettled(affected.map(async (d) => {
        const cleaned = await purgeEmDashFromDraft(d.draftText);
        const kw = scanForbiddenTerms(cleaned);
        const ed = scanEmDash(cleaned);
        const keptFlags = (d.complianceFlags || []).filter(f => !/em-dash/i.test(f) && !kw.hits.includes(f));
        const flags = [...kw.hits, ...ed.hits, ...keptFlags];
        await updateDraft(d.id, {
          draftText: cleaned,
          complianceCheckPassed: kw.passed && ed.passed,
          complianceFlags: flags,
        });
      }));
      const okCount = results.filter(r => r.status === 'fulfilled').length;
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));
      return json(200, { ok: true, action, affectedCount: affected.length, succeeded: okCount, errors });
    }

    if (action === 'repair_broken_drafts') {
      // One-off repair for a specific incident (2026-07-28): a bug in
      // purgeEmDashFromDraft sent Gemini a prompt with an un-interpolated
      // placeholder instead of the real draft text, so 5 drafts got
      // overwritten with the literal string "REPLACE_TEXT". The original
      // text is gone, so the only fix is regenerating a fresh, fully
      // compliance-checked draft per affected community. Deletes the broken
      // record first so draftForCommunity's normal createDraft path doesn't
      // leave a duplicate behind.
      const drafts = await listDrafts();
      const broken = drafts.filter(d => (d.draftText || '').trim() === 'REPLACE_TEXT');
      const results = await Promise.allSettled(broken.map(async (d) => {
        const community = await getCommunity(d.communityId);
        if (!community) throw new Error(`community ${d.communityId} not found for draft ${d.id}`);
        await deleteRecord(`draft:${d.id}`);
        return draftForCommunity(community);
      }));
      const okCount = results.filter(r => r.status === 'fulfilled').length;
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));
      return json(200, { ok: true, action, foundBroken: broken.length, succeeded: okCount, errors });
    }

    return json(400, { ok: false, error: 'action must be one of: discover, analyze, draft, purge_em_dashes, repair_broken_drafts' });
  } catch (e) {
    console.error('[admin-outreach-run]', e);
    return json(500, { ok: false, error: e.message });
  }
};
