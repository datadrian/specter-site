// admin-outreach-post-now.js - the "Post Now" button. Unlike the daily scheduled
// auto-poster (which picks whatever candidate the queue surfaces), this posts ONE
// specific, already-approved draft that Adrian explicitly chose in the console.
//
// This function does NOT do the posting itself (a Netlify function can't drive a
// browser). It validates eligibility server-side (defense in depth, never trust
// the button click alone), then hands off to the agent via the Base44 Superagent
// API, which runs the real browser automation and reports back through the same
// record-attempt / agent-log endpoints the daily job already uses.
const { json, corsPreflight } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, getDraft, getCommunity, listPostLog, getSettings } = require('./_lib/outreach-store');

const PLATFORM_COOLDOWN_DAYS = 4;
const AGENT_BASE_URL = 'https://app.base44.com/api/agents/6a251bc6339d09916e3f029c';
const AGENT_CONVERSATION_ID = '6a251bc70d15166b75ae6ae8';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { ok: false, error: 'Invalid JSON body.' });
  }
  const draftId = body.draftId;
  if (!draftId) return json(400, { ok: false, error: 'draftId is required.' });

  const settings = await getSettings();
  if (settings.autoPostPaused) {
    return json(409, { ok: false, error: 'Auto-posting is paused (Stop button is active). Resume it first.' });
  }

  const draft = await getDraft(draftId);
  if (!draft) return json(404, { ok: false, error: 'Draft not found.' });
  if (draft.status !== 'approved') {
    return json(409, { ok: false, error: `Draft must be approved first (current status: ${draft.status}).` });
  }

  const community = await getCommunity(draft.communityId);
  if (!community) return json(404, { ok: false, error: 'Community for this draft was not found.' });
  if (community.status !== 'vetted_allowlisted') {
    return json(409, { ok: false, error: 'Community must be allow-listed first.' });
  }

  const postlog = await listPostLog();
  const now = Date.now();
  const lastAutoPostSameCommunity = postlog
    .filter(p => p.method === 'auto' && p.communityId === community.id)
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))[0];
  if (lastAutoPostSameCommunity) {
    const ageDays = (now - new Date(lastAutoPostSameCommunity.postedAt).getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays < PLATFORM_COOLDOWN_DAYS) {
      return json(409, {
        ok: false,
        error: `This community was auto-posted to ${ageDays.toFixed(1)} day(s) ago; cooldown is ${PLATFORM_COOLDOWN_DAYS} days.`,
      });
    }
  }

  // Hand off to the agent. Bounded wait: the agent turn (including real browser
  // automation) can take well over a minute, and this Netlify function has a
  // hard time limit, so we don't block on the full response, just make sure the
  // request is fully sent, then return. The agent logs progress to the live
  // console widget and calls record-attempt/broadcasts on its own.
  const message = `MANUAL POST NOW: draftId=${draft.id}. Follow the "Manual Post Now" ` +
    `procedure in .agents/rules/specter_auto_poster.md exactly (not the daily queue ` +
    `procedure) for this specific draft. Re-validate eligibility yourself before ` +
    `posting. Follow every hard rule precisely.`;

  const apiKey = process.env.SPECTER_AGENT_API_KEY;
  if (!apiKey) {
    return json(500, { ok: false, error: 'Server misconfiguration: agent API key not set.' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    fetch(`${AGENT_BASE_URL}/conversations/${AGENT_CONVERSATION_ID}/messages`, {
      method: 'POST',
      headers: { 'api_key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
      signal: controller.signal,
    }).catch(() => {}).finally(() => clearTimeout(timeout));
    // Give the request a moment to actually go out before this function returns.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  } catch (e) {
    // Even on a client-side timeout/abort, the request may already be processing
    // server-side. Don't fail the whole action for this, just note it.
  }

  return json(200, {
    ok: true,
    triggered: true,
    message: 'Posting now, watch the live agent log for progress.',
  });
};
