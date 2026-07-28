// outreach-compliance.js — the hard content-safety guardrail for every
// outreach draft. SPECTER is marketed EXCLUSIVELY as a detection /
// evidence-capture instrument. No draft may ever reference internal
// producer-side or hidden features, regardless of how "native" a community's
// tone is supposed to sound. This mirrors the same rule already enforced on
// specter-imaging.com's public marketing.
//
// Two layers, both must pass:
//   1. FORBIDDEN_TERMS keyword scan — fast, deterministic, catches literal terms.
//   2. Gemini semantic re-check (done by the caller via gemini.js, MODEL_PRO)
//      — catches paraphrased/indirect references the keyword scan would miss.

const FORBIDDEN_TERMS = [
  'ghost injection', 'ghost-injection', 'profile injection', 'profile-injection',
  'depth-motion driver', 'depth motion driver', 'depth-motion driving', 'motion driver',
  'session arc', 'session throttl', 'auto-hit', 'auto hit',
  'node-trigger', 'node trigger', 'field-driver', 'field driver',
  'secret menu', 'producer tool', 'producer mode', 'producer menu',
  'talent alert', 'talent mode', // "talent" alone is too common a word to blocklist outright
  'show run', 'show-run', 'ghost-capture injection', 'ghost capture injection',
];

function scanForbiddenTerms(text) {
  const lower = String(text || '').toLowerCase();
  const hits = FORBIDDEN_TERMS.filter(term => lower.includes(term));
  return { passed: hits.length === 0, hits };
}

// Em-dash (—) is banned from outreach drafts too, same house style as the
// public site (see the site's own no-em-dash rule) — Adrian wants this
// enforced on every draft, not just the marketing site.
function scanEmDash(text) {
  const hasEmDash = /—/.test(String(text || ''));
  return { passed: !hasEmDash, hits: hasEmDash ? ['em-dash character (—) is not allowed, use a comma or period instead'] : [] };
}

module.exports = { FORBIDDEN_TERMS, scanForbiddenTerms, scanEmDash };
