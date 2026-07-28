// admin-outreach-record-attempt.js — called by the auto-poster (a scheduled
// agent step using browser automation) after it actually attempts a post.
// This is the ONLY place a Draft can move to status='posted' via automation,
// and every attempt (success or failure) is written to PostLog for audit —
// same guarantee as manual posting, per the standing guardrail that every
// post must be logged.
//
// On repeated failure for the same draft (e.g. the community's post form
// changed, or a login session expired) we stop retrying automatically after
// MAX_FAILURES and flip the draft to 'rejected' with a note, so it surfaces
// in the console for Adrian rather than silently retrying forever.
const { json, corsPreflight, readJson } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, getDraft, updateDraft, getCommunity, createPostLog } = require('./_lib/outreach-store');

const MAX_FAILURES = 3;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);

  const body = readJson(event);
  const { draftId, success, outcome, modFeedback, postUrl, username } = body;
  if (!draftId || typeof success !== 'boolean') {
    return json(400, { ok: false, error: 'draftId and success (boolean) are required.' });
  }

  const draft = await getDraft(draftId);
  if (!draft) return json(404, { ok: false, error: 'Draft not found.' });
  const community = await getCommunity(draft.communityId);

  if (success) {
    const updated = await updateDraft(draftId, {
      status: 'posted',
      postedAt: new Date().toISOString(),
      postUrl: postUrl || null,
      postedAsUsername: username || null,
    });
    await createPostLog({
      communityId: draft.communityId,
      draftId,
      method: 'auto',
      outcome: outcome || `Auto-posted to ${community ? community.name : draft.communityId}.`,
      modFeedback: modFeedback || null,
      postUrl: postUrl || null,
      postedAsUsername: username || null,
    });
    return json(200, { ok: true, draft: updated });
  }

  const failureCount = (draft.autoPostFailureCount || 0) + 1;
  const patch = { autoPostFailureCount: failureCount };
  if (failureCount >= MAX_FAILURES) {
    patch.status = 'rejected';
    patch.rejectionNote = `Auto-post failed ${failureCount} times, stopped retrying. Last error: ${outcome || 'unknown'}`;
  }
  const updated = await updateDraft(draftId, patch);
  await createPostLog({
    communityId: draft.communityId,
    draftId,
    method: 'auto',
    outcome: `FAILED (attempt ${failureCount}/${MAX_FAILURES}): ${outcome || 'unknown error'}`,
    modFeedback: modFeedback || null,
  });
  return json(200, { ok: true, draft: updated, failureCount });
};
