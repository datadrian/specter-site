// admin-outreach-ready-to-post.js — the queue the auto-poster (a scheduled
// agent step, not a Netlify function — browser automation isn't something a
// serverless function can do) checks before attempting anything.
//
// Eligibility requires ALL THREE, independently:
//   1. Community.status === 'vetted_allowlisted'   (Adrian vetted the rules)
//   2. Community.autoPostEnabled === true           (Adrian opted this one in)
//   3. Draft.status === 'approved'                  (Adrian approved THIS text)
//
// Plus two safety rate-limits, enforced HERE (server-side, not trusted to the
// caller): no more than one auto-post per platformType within PLATFORM_COOLDOWN_DAYS,
// and no more than MAX_AUTO_POSTS_PER_DAY auto-posts system-wide in the last 24h.
// This keeps posting cadence organic-looking and caps blast radius if anything
// misbehaves. Returns candidates oldest-approved-first; the caller should only
// ever act on the FIRST one per run.
const { json, corsPreflight } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, listCommunities, listDrafts, listPostLog, getSettings } = require('./_lib/outreach-store');

const PLATFORM_COOLDOWN_DAYS = 4;
const MAX_AUTO_POSTS_PER_DAY = 1;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);

  const settings = await getSettings();
  if (settings.autoPostPaused) {
    return json(200, { ok: true, candidates: [], throttled: true, reason: 'Auto-posting is paused (Stop button is active).' });
  }

  const [communities, drafts, postlog] = await Promise.all([listCommunities(), listDrafts(), listPostLog()]);

  const now = Date.now();
  const autoPosts = postlog.filter(p => p.method === 'auto');
  const postsLast24h = autoPosts.filter(p => now - new Date(p.postedAt).getTime() < 24 * 60 * 60 * 1000);
  if (postsLast24h.length >= MAX_AUTO_POSTS_PER_DAY) {
    return json(200, { ok: true, candidates: [], throttled: true, reason: `Already ${postsLast24h.length} auto-post(s) in the last 24h (limit ${MAX_AUTO_POSTS_PER_DAY}).` });
  }

  const lastAutoPostByPlatform = {};
  for (const p of autoPosts) {
    const c = communities.find(x => x.id === p.communityId);
    if (!c) continue;
    const t = new Date(p.postedAt).getTime();
    if (!lastAutoPostByPlatform[c.platformType] || t > lastAutoPostByPlatform[c.platformType]) {
      lastAutoPostByPlatform[c.platformType] = t;
    }
  }

  const eligibleCommunities = new Map(
    communities
      .filter(c => c.status === 'vetted_allowlisted' && c.autoPostEnabled)
      .filter(c => {
        const last = lastAutoPostByPlatform[c.platformType];
        return !last || (now - last) > PLATFORM_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      })
      .map(c => [c.id, c])
  );

  const candidates = drafts
    .filter(d => d.status === 'approved' && eligibleCommunities.has(d.communityId))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(d => ({ draft: d, community: eligibleCommunities.get(d.communityId) }));

  return json(200, { ok: true, candidates, throttled: false });
};
