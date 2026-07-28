// admin-outreach-drafts.js — list/inspect drafts, approve/reject, and record
// manual posting. Phase 1 has no automatic posting execution: approving a
// draft for a vetted_allowlisted community marks it ready, but Adrian marks
// it "posted" himself once he's actually posted it (manually, or later once
// an auto-post executor is wired in). Every posted draft writes a PostLog
// entry so there is always an audit trail.
const { json, corsPreflight, readJson } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, listDrafts, getDraft, updateDraft, getCommunity, createPostLog } = require('./_lib/outreach-store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);

  const id = event.queryStringParameters?.id;

  if (event.httpMethod === 'GET') {
    if (id) {
      const d = await getDraft(id);
      if (!d) return json(404, { ok: false, error: 'Draft not found.' });
      return json(200, { ok: true, draft: d });
    }
    const drafts = await listDrafts();
    return json(200, { ok: true, drafts });
  }

  if (event.httpMethod === 'PATCH' && id) {
    const body = readJson(event);
    const draft = await getDraft(id);
    if (!draft) return json(404, { ok: false, error: 'Draft not found.' });

    if (body.status === 'approved') {
      const updated = await updateDraft(id, { status: 'approved' });
      return json(200, { ok: true, draft: updated });
    }

    if (body.status === 'rejected') {
      const updated = await updateDraft(id, { status: 'rejected', rejectionNote: body.note || '' });
      return json(200, { ok: true, draft: updated });
    }

    if (body.status === 'pending_review') {
      // "un-approve" — send an approved-by-mistake draft back to review, clearing any posted state.
      const updated = await updateDraft(id, { status: 'pending_review', postedAt: null });
      return json(200, { ok: true, draft: updated });
    }

    if (body.status === 'posted') {
      // Only meaningful once approved; record as a manual post + audit log entry.
      // postUrl / postedAsUsername are optional but strongly encouraged — they're
      // what let the console show "View post" links and who it was posted as.
      const updated = await updateDraft(id, {
        status: 'posted',
        postedAt: new Date().toISOString(),
        postUrl: body.postUrl || null,
        postedAsUsername: body.postedAsUsername || null,
      });
      const community = await getCommunity(draft.communityId);
      await createPostLog({
        communityId: draft.communityId,
        draftId: draft.id,
        method: 'manual',
        outcome: `Marked posted by admin${community ? ' to ' + community.name : ''}.`,
        postUrl: body.postUrl || null,
        postedAsUsername: body.postedAsUsername || null,
      });
      return json(200, { ok: true, draft: updated });
    }

    return json(400, { ok: false, error: 'Unsupported status transition.' });
  }

  return json(405, { error: 'Method not allowed' });
};
