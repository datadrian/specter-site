// outreach-engine.js — the actual discovery / rule-analysis / drafting logic.
// All LLM judgment calls live here, calling out to gemini.js. Endpoint files
// (admin-outreach-run.js, outreach-scheduled.js) just orchestrate batches of
// these calls and persist results via outreach-store.js.

const { generate, extractJson, MODEL_FLASH, MODEL_PRO } = require('./gemini');
const { FORBIDDEN_TERMS, scanForbiddenTerms } = require('./outreach-compliance');
const store = require('./outreach-store');

const SPECTER_POSITIONING = `SPECTER is a paranormal-investigation instrument (hardware + software) that
captures and analyzes environmental evidence — depth/3D sensing, RGB, thermal imaging, EVP audio capture,
a wireless field sensor node, and remote phone monitoring — fused into a live anomaly score and a
searchable evidence archive. It is sold as a detection and evidence-capture instrument for investigators
and enthusiasts, one-time license, $399. Public site: specter-imaging.com.`;

const FORBIDDEN_NOTE = `Never mention or hint at, under any phrasing: ${FORBIDDEN_TERMS.join(', ')}, or any
other hidden/producer-only feature. SPECTER is described ONLY as a detection/evidence-capture instrument.`;

// ---- Discovery ----

const DISCOVERY_QUERIES = [
  {
    platformType: 'reddit',
    label: 'Reddit',
    prompt: `Search for currently active subreddits (real, existing, still-active communities) where people
discuss paranormal investigation, ghost hunting, EVP research, or related equipment/gadgets — include at
least one general skeptic or DIY-electronics subreddit that sometimes discusses this gear too. Return the
3-5 best real matches you can verify exist right now.`,
  },
  {
    platformType: 'forum',
    label: 'Dedicated paranormal forums',
    prompt: `Search for currently active dedicated paranormal/ghost-hunting discussion forums (standalone
forum websites, not Reddit or Facebook — e.g. things like AboveTopSecret or similar long-running paranormal
community forums). Return the 3-5 best real, currently-reachable matches you can verify exist right now.`,
  },
  {
    platformType: 'facebook_group',
    label: 'Facebook Groups',
    prompt: `Search for currently active public Facebook Groups about paranormal investigation or ghost
hunting. Return the 3-5 best real matches you can verify exist right now, with their Facebook Group URLs.`,
  },
  {
    platformType: 'other',
    label: 'Broad discovery',
    prompt: `Search broadly for any other kind of currently active online community (Discord server
listing pages, niche forums, blogs with active comment communities, YouTube channel communities, etc.)
where paranormal investigators or ghost-hunting enthusiasts gather and discuss gear/equipment. Return the
3-5 best real matches you can verify exist right now.`,
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

async function analyzeCommunity(community) {
  let pageText = '';
  let fetchError = null;
  try {
    pageText = await fetchPageText(community.url);
  } catch (e) {
    fetchError = e.message;
  }

  if (!pageText || pageText.length < 200) {
    return store.updateCommunity(community.id, {
      rulesSummary: fetchError
        ? `Unavailable — could not retrieve page (${fetchError}). May require login or JavaScript.`
        : 'Unavailable — page returned little to no readable content.',
      allowsSelfPromotion: 'unknown',
      status: 'needs_review',
      lastCheckedAt: new Date().toISOString(),
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
    rulesSummary: j.rulesSummary || '',
    allowsSelfPromotion: ['yes', 'conditional', 'no', 'unknown'].includes(j.allowsSelfPromotion) ? j.allowsSelfPromotion : 'unknown',
    selfPromoNotes: j.selfPromoNotes || '',
    activityNotes: j.activityNotes || '',
    status: 'needs_review', // analysis never self-allowlists — only Adrian can promote to vetted_allowlisted
    lastCheckedAt: new Date().toISOString(),
  });
}

// ---- Drafting + compliance ----

async function draftPostText(community, redraftNote) {
  const prompt = `${SPECTER_POSITIONING}\n\n${FORBIDDEN_NOTE}\n\nWrite a single forum/social post introducing
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
  let result = await draftPostText(community);
  let keywordScan = scanForbiddenTerms(result.draftText);

  if (!keywordScan.passed) {
    // one redraft attempt, explicitly told what was flagged
    result = await draftPostText(community, `\nIMPORTANT: your previous draft used forbidden language: ${keywordScan.hits.join(', ')}. Do not use these terms or anything similar.`);
    keywordScan = scanForbiddenTerms(result.draftText);
  }

  let semantic = { passes: true, flags: [] };
  try {
    semantic = await semanticComplianceCheck(result.draftText);
  } catch (e) {
    semantic = { passes: true, flags: [`semantic check unavailable: ${e.message}`] }; // keyword scan is still authoritative
  }

  const passed = keywordScan.passed && semantic.passes !== false;
  const flags = [...keywordScan.hits, ...(Array.isArray(semantic.flags) ? semantic.flags : [])];

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

module.exports = { discoverCommunities, analyzeCommunity, draftForCommunity, normalizeUrl };
