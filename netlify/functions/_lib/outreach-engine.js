// outreach-engine.js — the actual discovery / rule-analysis / drafting logic.
// All LLM judgment calls live here, calling out to gemini.js. Endpoint files
// (admin-outreach-run.js, outreach-scheduled.js) just orchestrate batches of
// these calls and persist results via outreach-store.js.

const { generate, extractJson, MODEL_FLASH, MODEL_PRO } = require('./gemini');
const { FORBIDDEN_TERMS, scanForbiddenTerms, scanEmDash } = require('./outreach-compliance');
const store = require('./outreach-store');

const SPECTER_POSITIONING = `SPECTER is a paranormal-investigation instrument (hardware + software) that
captures and analyzes environmental evidence — depth/3D sensing, RGB, thermal imaging, EVP audio capture,
a wireless field sensor node, and remote phone monitoring — fused into a live anomaly score and a
searchable evidence archive. It is sold as a detection and evidence-capture instrument for investigators
and enthusiasts, one-time license, $199.`;

const FORBIDDEN_NOTE = `Never mention or hint at, under any phrasing: ${FORBIDDEN_TERMS.join(', ')}, or any
other hidden/producer-only feature. SPECTER is described ONLY as a detection/evidence-capture instrument.`;

const EM_DASH_NOTE = `Do NOT use the em-dash character anywhere in the text. Use a comma, period, colon, or
parentheses instead wherever you would normally reach for a dash.`;

// Adrian's quality bar (added per his request): only pursue communities that
// are both large (5,000+ members) and demonstrably active. This note nudges
// discovery to surface bigger, established communities in the first place;
// the REAL enforcement is the verified check in evaluateQualityBar() below —
// discovery's own guesses about size aren't trustworthy enough to gate on.
const SIZE_PREFERENCE_NOTE = `Strongly prefer larger, well-established communities with a meaningfully
large, active membership (thousands of members) over small, obscure, or low-traffic ones.`;

const MIN_MEMBER_COUNT = 5000;
// How stale "most recent activity" can be before a community that isn't
// active *today* still counts as active enough - forums move slower than Reddit.
const ACTIVITY_STALE_DAYS = 30;

// ---- Discovery ----

const DISCOVERY_QUERIES = [
  {
    platformType: 'reddit',
    label: 'Reddit',
    prompt: `Search for currently active subreddits (real, existing, still-active communities) where people
discuss paranormal investigation, ghost hunting, EVP research, or related equipment/gadgets — include at
least one general skeptic or DIY-electronics subreddit that sometimes discusses this gear too. ${SIZE_PREFERENCE_NOTE}
Return the 3-5 best real matches you can verify exist right now.`,
  },
  {
    platformType: 'forum',
    label: 'Dedicated paranormal forums',
    prompt: `Search for currently active dedicated paranormal/ghost-hunting discussion forums (standalone
forum websites, not Reddit or Facebook — e.g. things like AboveTopSecret or similar long-running paranormal
community forums). ${SIZE_PREFERENCE_NOTE} Return the 3-5 best real, currently-reachable matches you can
verify exist right now.`,
  },
  {
    platformType: 'facebook_group',
    label: 'Facebook Groups',
    prompt: `Search for currently active public Facebook Groups about paranormal investigation or ghost
hunting. ${SIZE_PREFERENCE_NOTE} Return the 3-5 best real matches you can verify exist right now, with
their Facebook Group URLs.`,
  },
  {
    platformType: 'other',
    label: 'Broad discovery',
    prompt: `Search broadly for any other kind of currently active online community (Discord server
listing pages, niche forums, blogs with active comment communities, YouTube channel communities, etc.)
where paranormal investigators or ghost-hunting enthusiasts gather and discuss gear/equipment. ${SIZE_PREFERENCE_NOTE}
Return the 3-5 best real matches you can verify exist right now.`,
  },
];

async function discoverCommunities() {
  const existing = await store.listCommunities();
  const existingUrls = new Set(existing.map(c => normalizeUrl(c.url)));

  const results = await Promise.all(DISCOVERY_QUERIES.map(async (q) => {
    try {
      const text = await generate({
        model: MODEL_FLASH,
        useSearch: true,
        prompt: `${q.prompt}\n\nRespond with ONLY a JSON array, no prose, in this exact shape:\n` +
          `[{"name": "...", "url": "https://...", "whyRelevant": "one short sentence"}]`,
      });
      const arr = extractJson(text);
      return { platformType: q.platformType, label: q.label, items: Array.isArray(arr) ? arr : [] };
    } catch (e) {
      return { platformType: q.platformType, label: q.label, items: [], error: e.message };
    }
  }));

  const created = [];
  let skipped = 0;
  for (const r of results) {
    for (const item of r.items) {
      if (!item.url || !/^https?:\/\//i.test(item.url)) continue;
      const norm = normalizeUrl(item.url);
      if (existingUrls.has(norm)) { skipped++; continue; }
      existingUrls.add(norm);
      const rec = await store.createCommunity({
        name: item.name || item.url,
        url: item.url,
        platformType: r.platformType,
        discoveredVia: r.label,
        activityNotes: item.whyRelevant || '',
        status: 'discovered',
        allowsSelfPromotion: 'unknown',
      });
      created.push(rec);
    }
  }
  const errors = results.filter(r => r.error).map(r => `${r.label}: ${r.error}`);
  return { created, skipped, errors };
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    return (url.hostname + url.pathname).toLowerCase().replace(/\/$/, '');
  } catch {
    return String(u || '').toLowerCase().trim();
  }
}

// ---- Rule analysis ----

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPageText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpecterOutreachBot/1.0)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return stripHtml(html);
}

// ---- Recency-of-activity + size check ----
// Adrian's rule: a community should have visible activity from today (or very
// recent), AND a real membership of 5,000+, before it's worth allow-listing —
// don't waste posts on dead or tiny forums. Uses live Google Search grounding
// (not just the one scraped URL) since several platform types (Reddit, Facebook
// Groups) commonly block server-side scraping but ARE well-indexed by Google,
// so search finds member counts/recent posts even when our own fetch of
// community.url fails.
async function checkActivityAndSize(community) {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Today's date is ${today}. Using web search, research the online community "${community.name}"
(${community.url}, platform: ${community.platformType}) and determine two things:

1. Its approximate member/subscriber count — a real number, taken from the platform's own member-count
   display, About page, or a reliable secondary source. Not a guess.
2. How recently it has had real activity (a new post, thread, or comment). Find the most recent visible
   post/thread you can and note its date.

Respond with ONLY JSON in this exact shape:
{"memberCount": a number, or null if you cannot find a reliable count,
 "memberCountSummary": "one short sentence on where that count came from / how confident you are",
 "mostRecentActivityDate": "YYYY-MM-DD, or null if you cannot determine one",
 "hasActivityToday": true or false or null,
 "activityRecencySummary": "one short sentence describing what you found"}
If you cannot find reliable evidence either way, use null for the fields you're unsure of and say so
honestly in the summaries. Do not guess or assume a count or activity just because the community exists.`;
  try {
    const text = await generate({ model: MODEL_PRO, useSearch: true, prompt, temperature: 0.1 });
    const j = extractJson(text);
    return {
      memberCount: typeof j.memberCount === 'number' ? j.memberCount : null,
      memberCountSummary: j.memberCountSummary || '',
      mostRecentActivityDate: j.mostRecentActivityDate || null,
      hasActivityToday: typeof j.hasActivityToday === 'boolean' ? j.hasActivityToday : null,
      activityRecencySummary: j.activityRecencySummary || '',
    };
  } catch (e) {
    return {
      memberCount: null,
      memberCountSummary: `Check unavailable: ${e.message}`,
      mostRecentActivityDate: null,
      hasActivityToday: null,
      activityRecencySummary: `Activity check unavailable: ${e.message}`,
    };
  }
}

// Judges the verified activity/size check against Adrian's quality bar. Only
// auto-rejects on POSITIVE evidence of failing (a real verified count under
// the bar, or confirmed staleness) — same "never assume fine, never assume
// failure, on unknown" pattern already used for the self-promotion rule below:
// a community we couldn't verify still goes to needs_review for Adrian's own
// eyes, it just isn't thrown out automatically for lack of data.
function evaluateQualityBar(activity) {
  const reasons = [];
  if (typeof activity.memberCount === 'number' && activity.memberCount < MIN_MEMBER_COUNT) {
    reasons.push(`Only ~${activity.memberCount.toLocaleString()} members (need ${MIN_MEMBER_COUNT.toLocaleString()}+).`);
  }
  if (activity.hasActivityToday === false) {
    const ageDays = activity.mostRecentActivityDate
      ? (Date.now() - new Date(activity.mostRecentActivityDate).getTime()) / 86400000
      : null;
    const stale = ageDays === null || ageDays > ACTIVITY_STALE_DAYS;
    if (stale) {
      reasons.push(activity.mostRecentActivityDate
        ? `No activity found since ${activity.mostRecentActivityDate} (looks inactive).`
        : `No recent activity could be found (looks inactive).`);
    }
  }
  if (reasons.length > 0) return { failed: true, meetsBar: false, note: reasons.join(' ') };
  const fullyVerified = typeof activity.memberCount === 'number' && activity.hasActivityToday !== null;
  return {
    failed: false,
    meetsBar: fullyVerified ? true : null, // null = passes so far, but unverified - not a confirmed pass
    note: fullyVerified
      ? `Meets quality bar: ~${activity.memberCount.toLocaleString()} members, active.`
      : 'Member count and/or activity could not be fully verified — needs a manual look.',
  };
}

async function analyzeCommunity(community) {
  // Run the page scrape and the (independent) search-grounded activity+size
  // check CONCURRENTLY, not sequentially — this used to be two serial awaits,
  // which combined with the rules-analysis call afterward was pushing analyze
  // batches past Netlify's function time limit. They don't depend on each other.
  const [pageTextResult, activity] = await Promise.all([
    fetchPageText(community.url).then(text => ({ text, error: null })).catch(e => ({ text: '', error: e.message })),
    checkActivityAndSize(community),
  ]);
  const pageText = pageTextResult.text;
  const fetchError = pageTextResult.error;

  const qualityBar = evaluateQualityBar(activity);
  const sizeActivityFields = {
    lastCheckedAt: new Date().toISOString(),
    memberCount: activity.memberCount,
    memberCountSummary: activity.memberCountSummary,
    mostRecentActivityDate: activity.mostRecentActivityDate,
    hasActivityToday: activity.hasActivityToday,
    activityRecencySummary: activity.activityRecencySummary,
    meetsQualityBar: qualityBar.meetsBar,
    qualityGateNote: qualityBar.note,
  };

  if (qualityBar.failed) {
    // Confirmed too small and/or confirmed inactive - auto-reject without
    // spending an extra LLM call on rules-analysis for a community we're not
    // going to pursue anyway. This is a SAFE automatic action (a rejection,
    // not an allow-list): the self-promotion "never self-allowlist" guardrail
    // below is untouched, this only ever auto-DISCARDS clear duds so Adrian
    // isn't stuck manually rejecting every dead/tiny forum discovery turns up.
    return store.updateCommunity(community.id, {
      ...sizeActivityFields,
      status: 'rejected',
      rulesSummary: `Auto-rejected on quality bar: ${qualityBar.note}`,
    });
  }

  if (!pageText || pageText.length < 200) {
    return store.updateCommunity(community.id, {
      ...sizeActivityFields,
      rulesSummary: fetchError
        ? `Unavailable — could not retrieve page (${fetchError}). May require login or JavaScript.`
        : 'Unavailable — page returned little to no readable content.',
      allowsSelfPromotion: 'unknown',
      status: 'needs_review',
    });
  }

  const prompt = `You are assessing a paranormal-investigation online community's rules on self-promotion
so we can decide whether to introduce a product there. Community: ${community.name} (${community.url}),
platform: ${community.platformType}.

Here is text scraped from its rules/about/sidebar page (may include unrelated boilerplate — ignore that):
"""${pageText.slice(0, 8000)}"""

Judge: does this community allow self-promotion / product mentions, and under what conditions? Respond
with ONLY JSON in this exact shape:
{"allowsSelfPromotion": "yes" | "conditional" | "no" | "unknown",
 "rulesSummary": "1-3 sentence summary of the actual self-promo/advertising rule",
 "selfPromoNotes": "specific conditions if any, e.g. only in a weekly self-promo thread, or empty string",
 "activityNotes": "brief note on the community's tone/culture relevant to how a post should sound"}
If the text doesn't clearly state a self-promotion policy, use "unknown" — do not guess.`;

  const text = await generate({ model: MODEL_PRO, prompt, temperature: 0.2 });
  const j = extractJson(text);

  return store.updateCommunity(community.id, {
    ...sizeActivityFields,
    rulesSummary: j.rulesSummary || '',
    allowsSelfPromotion: ['yes', 'conditional', 'no', 'unknown'].includes(j.allowsSelfPromotion) ? j.allowsSelfPromotion : 'unknown',
    selfPromoNotes: j.selfPromoNotes || '',
    activityNotes: j.activityNotes || '',
    status: 'needs_review', // analysis never self-allowlists — only Adrian can promote to vetted_allowlisted
  });
}

// ---- Drafting + compliance ----

async function draftPostText(community, redraftNote) {
  // Use a clean per-community tracking link ("specter-imaging.com/r/<slug>") instead
  // of a raw domain + visible ?utm_ query string - a tracking parameter in text someone
  // typed themselves reads as a marketing tool and undermines the genuine, disclosed
  // tone this whole system is built around. The /r/ redirect still logs which
  // community drove the click server-side, just without exposing that in the post.
  const link = community.trackingSlug ? `specter-imaging.com/r/${community.trackingSlug}` : 'specter-imaging.com';
  const LINK_NOTE = `If you mention where to learn more, reference it as exactly "${link}" (not any other URL,
not a shortened or modified form) - write it naturally in a sentence the same way you'd casually mention any
website, e.g. "check it out at ${link}".`;
  const prompt = `${SPECTER_POSITIONING}\n\n${LINK_NOTE}\n\n${FORBIDDEN_NOTE}\n\n${EM_DASH_NOTE}\n\nWrite a single forum/social post introducing
SPECTER to this specific community, written to sound like a genuine long-time member sharing something
useful — NOT like an advertisement. Community: ${community.name} (${community.platformType}).
Self-promotion policy: ${community.allowsSelfPromotion}. Notes: ${community.selfPromoNotes || 'none'}.
Community tone: ${community.activityNotes || 'unknown, keep it neutral and genuine'}.

Rules for the post itself:
- If allowsSelfPromotion is "no": write a genuine discussion post (a question, a field observation, a
  technique) with NO product name and NO link at all. Do not mention SPECTER.
- If "conditional": follow the noted venue/format (e.g. only in a designated thread) and keep it light.
- If "yes" or "unknown": lead with a real discussion hook (a question or observation), THEN mention SPECTER
  naturally as something you built/use, without a hard sales pitch or superlatives.
- Match the platform's normal post length and tone (Reddit posts read differently than forum posts).
- Disclose you're associated with SPECTER if you mention it at all — never pretend to be a random satisfied
  customer with no connection.
${redraftNote || ''}

Respond with ONLY JSON in this exact shape:
{"draftText": "the full post text", "targetContext": "e.g. 'new post' or 'reply framing'",
 "adaptationReasoning": "1-2 sentences on why you wrote it this way for this specific community"}`;

  const text = await generate({ model: MODEL_FLASH, prompt, temperature: 0.75 });
  return extractJson(text);
}

async function semanticComplianceCheck(draftText) {
  const prompt = `Check this forum/social post draft for any reference — even indirect, paraphrased, or
hinted-at — to these forbidden internal concepts: ${FORBIDDEN_TERMS.join(', ')}, or any other hidden/producer-only
feature of a product called SPECTER (which must be described only as a detection/evidence-capture instrument).

Draft:
"""${draftText}"""

Respond with ONLY JSON: {"passes": true|false, "flags": ["short description of each issue found, empty array if none"]}`;
  const text = await generate({ model: MODEL_PRO, prompt, temperature: 0.1 });
  return extractJson(text);
}

async function draftForCommunity(community) {
  if (!community.trackingSlug) {
    const existing = await store.listCommunities();
    const slug = await store.generateUniqueTrackingSlug(community.name, existing);
    const updated = await store.updateCommunity(community.id, { trackingSlug: slug });
    if (updated) community = updated;
  }
  let result = await draftPostText(community);
  let keywordScan = scanForbiddenTerms(result.draftText);
  let emDashScan = scanEmDash(result.draftText);

  if (!keywordScan.passed || !emDashScan.passed) {
    // one redraft attempt, explicitly told what was flagged
    const issues = [...keywordScan.hits, ...emDashScan.hits];
    result = await draftPostText(community, `\nIMPORTANT: your previous draft had these problems: ${issues.join(', ')}. Fix them: do not use forbidden language, and do not use the em-dash character anywhere, use a comma or period instead.`);
    keywordScan = scanForbiddenTerms(result.draftText);
    emDashScan = scanEmDash(result.draftText);
  }

  let semantic = { passes: true, flags: [] };
  try {
    semantic = await semanticComplianceCheck(result.draftText);
  } catch (e) {
    semantic = { passes: true, flags: [`semantic check unavailable: ${e.message}`] }; // keyword scan is still authoritative
  }

  const passed = keywordScan.passed && emDashScan.passed && semantic.passes !== false;
  const flags = [...keywordScan.hits, ...emDashScan.hits, ...(Array.isArray(semantic.flags) ? semantic.flags : [])];

  return store.createDraft({
    communityId: community.id,
    draftText: result.draftText || '',
    targetContext: result.targetContext || 'new post',
    adaptationReasoning: result.adaptationReasoning || '',
    complianceCheckPassed: passed,
    complianceFlags: flags,
    status: passed ? 'pending_review' : 'rejected',
  });
}

// ---- Em-dash purge (one-off migration for drafts written before the no-em-dash rule) ----

async function purgeEmDashFromDraft(draftText) {
  const emdash = String.fromCharCode(8212);
  const prompt = `Rewrite the following text to remove EVERY em-dash character (${emdash}), replacing each one with
whatever punctuation reads most naturally in its place (a comma, period, colon, or parentheses). Do NOT
change anything else: keep every word, sentence, meaning, tone, and disclosure exactly as it is. Only fix
the em-dashes.

Text:
START_TEXT
${draftText}
END_TEXT

Respond with ONLY JSON in this exact shape: {"text": "the rewritten text with no em-dashes"}`;
  const text = await generate({ model: MODEL_FLASH, prompt, temperature: 0.1 });
  const j = extractJson(text);
  const cleaned = j.text || '';
  // Safety net: refuse to accept an empty or suspiciously short rewrite rather than
  // risk overwriting real draft content with garbage (this is exactly the class of
  // bug that previously destroyed 5 real drafts — an un-interpolated prompt
  // placeholder caused the model to echo back a literal token instead of real text).
  if (!cleaned || cleaned.length < draftText.length * 0.5) {
    throw new Error('purgeEmDashFromDraft: rewrite looked invalid (empty or too short) — refusing to overwrite original draft text');
  }
  return cleaned;
}

module.exports = { discoverCommunities, analyzeCommunity, draftForCommunity, purgeEmDashFromDraft, normalizeUrl };
