'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

for (const page of ['terms-of-sale.html', 'refund-policy.html', 'license-agreement.html', 'privacy.html', 'open-source.html']) {
  const html = read(`sdr-site/${page}`);
  assert(html.length > 3000, `${page} must be substantive`);
  assert(html.includes(page === 'privacy.html' ? 'September 17, 2026' : 'September 16, 2026'), `${page} must show the effective date`);
  assert(html.includes('support@specter-imaging.com'), `${page} must identify the support contact`);
}
const eula = read('sdr-site/license-agreement.html');
assert(eula.includes('Adrian Stucker, doing business as SPECTER'), 'the licensor must be identified');
assert(eula.includes('governed solely by their applicable licenses'), 'open-source licenses must control their components');
assert(eula.includes('Colorado law'), 'the agreement must use the seller jurisdiction');
assert(!eula.includes('State of California'), 'the stale California clause must be removed');

const terms = read('sdr-site/terms-of-sale.html');
assert(terms.includes('USD 49.99') && terms.includes('USD 349'), 'terms must state current prices');
assert(terms.includes('No recurring subscription'), 'terms must state that checkout is not recurring');
const refunds = read('sdr-site/refund-policy.html');
assert(refunds.includes('14 calendar days') && refunds.includes('original payment method'), 'refund terms must be clear');

const sdrIndex = read('sdr-site/index.html');
const imagingIndex = read('public/index.html');
assert((sdrIndex.match(/data-checkout-consent/g) || []).length === 2, 'both SDR purchase options must have clickwrap');
assert((imagingIndex.match(/data-checkout-consent/g) || []).length >= 2, 'SDR and bundle options on the family site must have clickwrap');
for (const rel of ['sdr-site/app.js', 'public/app.js']) {
  const app = read(rel);
  assert(app.includes('acceptedLegal') && app.includes('data-checkout-consent'), `${rel} must enforce and record acceptance`);
}
const checkout = read('netlify/functions/create-checkout.js');
assert(checkout.includes("body.acceptedLegal !== true"), 'the server must reject unaccepted SDR checkout');
for (const field of ['legal_accepted_at', 'terms_version', 'eula_version', 'privacy_version', 'refund_version']) assert(checkout.includes(field), `checkout metadata must record ${field}`);

const privacy = read('sdr-site/privacy.html');
const tracker = read('sdr-site/analytics-track.js');
assert(privacy.includes('Anonymous website usage counts') && privacy.includes('Global Privacy Control'), 'privacy policy must explain consent and privacy signals');
assert(tracker.includes('function optedOut()') && !tracker.includes('function makeId'), 'anonymous counting must honor opt-out without making IDs');
assert(tracker.includes('navigator.globalPrivacyControl') && tracker.includes('navigator.doNotTrack'), 'analytics must honor browser privacy signals');
assert((Array.from(walk(path.join(root, 'sdr-site'))).filter((file) => file.endsWith('.html'))).every((file) => read(path.relative(root, file)).includes('analytics-track.js')), 'every SDR page must load the consent gate');
const sdrCss = read('sdr-site/site.css');
assert(sdrCss.includes('background:rgba(12,16,24,.98)') && sdrCss.includes('grid-template-columns:minmax(0,1fr) auto'), 'analytics consent must render as an opaque, non-overlapping desktop panel');
assert(sdrCss.includes('.analytics-consent-actions{display:grid;grid-template-columns:1fr 1fr'), 'analytics consent actions must fit narrow mobile screens');
assert(sdrCss.includes('@media(min-width:701px)') && sdrCss.includes('width:min(760px,calc(100% - 2.5rem))'), 'desktop analytics consent must stay clear of the primary hero actions');
assert(sdrCss.includes('@media(max-width:1180px)') && sdrCss.includes('@media(max-width:920px)'), 'navigation must have tablet formatting breakpoints');
assert(sdrCss.includes('@media(max-width:1160px)') && sdrCss.includes('font-size:clamp(5.4rem,7.3vw,7.4rem)'), 'hero must stack before it becomes cramped and keep its title clear of the workstation image');
assert(!/analytics-consent[^}]*var\(--panel\)/.test(sdrCss), 'analytics panel must not use an undefined color token');

const { scanEmDash } = require('../netlify/functions/_lib/outreach-compliance');
assert(scanEmDash('radio-frequency').passed, 'ordinary hyphens must remain allowed in outreach');
assert(!scanEmDash('before' + String.fromCodePoint(0x2014) + 'after').passed, 'the outreach em-dash guardrail must remain active');

const sourcePage = read('sdr-site/open-source.html');
assert(sourcePage.includes('SPECTER-SDR-Open-Source-Components-1.7.38.zip'), 'source page must link the compliance release archive');
assert(sourcePage.includes('e7af96c3218639d67c75dfc4c4432a8aa53b54cae1326dce16945d6eca69a8b1'), 'source page must publish the verified source archive checksum');
const downloadPage = read('sdr-site/download.html');
const successPage = read('sdr-site/success.html');
for (const page of [downloadPage, successPage]) assert(page.includes('SPECTER-SDR-Setup-1.7.38.exe'), 'every customer download path must use 1.7.38');
assert(downloadPage.includes('8290a25a71a58a97aff7d15e4ab2b7cdc1e8293ca52da32629123834fe65f765'), 'download page must publish the verified installer checksum');
assert(downloadPage.includes('420,242,312 bytes'), 'download page must publish the verified installer size');
assert(!Array.from(walk(path.join(root, 'sdr-site'))).filter((file) => file.endsWith('.html')).some((file) => read(path.relative(root, file)).includes('SPECTER-SDR-Setup-1.7.37.exe')), 'stale 1.7.37 installer links must be removed');
assert(sourcePage.includes('GPL-3.0-or-later') && sourcePage.includes('h264_mf'), 'source page must explain the sidecar and FFmpeg boundary');

for (const file of walk(root)) {
  if (!/\.(?:html|js|css|json|md|txt|xml|toml|yml|yaml)$/.test(file)) continue;
  if (file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}.git${path.sep}`)) continue;
  const text = fs.readFileSync(file, 'utf8');
  assert(!text.includes('\u2014') && !text.includes('&' + 'mdash;') && !text.includes('&#' + '8212;'), `em dash is forbidden: ${path.relative(root, file)}`);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full); else yield full;
  }
}
console.log('SDR sale-readiness site tests PASS');
