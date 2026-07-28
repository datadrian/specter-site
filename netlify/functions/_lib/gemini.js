// gemini.js — thin wrapper around the Gemini API. This IS the "brain" for the
// outreach bot: community discovery (via Google Search grounding), forum-rule
// judgment, post drafting, and a semantic compliance re-check all go through
// here. Runs server-side on the SPECTER admin backend only — never exposed
// to the public site.
//
// Required env (Netlify): GEMINI_API_KEY.
//
// Model choice:
//   MODEL_FLASH (gemini-3.5-flash) — volume work: discovery search, drafting.
//   MODEL_PRO   (gemini-3.1-pro-preview) — judgment work: reading a forum's
//               rules and deciding what they actually allow, and the final
//               semantic compliance re-check on a draft.

const MODEL_FLASH = 'gemini-3.5-flash';
const MODEL_PRO = 'gemini-3.1-pro-preview';

function apiKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY not configured on Netlify.');
  return k;
}

async function generate({ model, prompt, useSearch = false, temperature = 0.6 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey()}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature },
  };
  if (useSearch) body.tools = [{ google_search: {} }];

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('');
}

// Pulls the first valid JSON value out of a Gemini text response, tolerating
// ```json fences and trailing prose the model sometimes adds despite instructions.
function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error('No JSON found in Gemini response: ' + text.slice(0, 200));
  const rest = candidate.slice(start);
  try {
    return JSON.parse(rest);
  } catch {
    for (let end = rest.length; end > 0; end--) {
      try { return JSON.parse(rest.slice(0, end)); } catch { /* keep shrinking */ }
    }
    throw new Error('Could not parse JSON from Gemini response: ' + text.slice(0, 200));
  }
}

module.exports = { generate, extractJson, MODEL_FLASH, MODEL_PRO };
