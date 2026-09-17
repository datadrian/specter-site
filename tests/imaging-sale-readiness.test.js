'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

for (const page of ['terms-of-sale.html', 'refund-policy.html', 'license-agreement.html', 'privacy.html', 'open-source.html']) {
  assert(fs.existsSync(path.join(root, 'public', page)), `missing Imaging legal page: ${page}`);
  const html = read(`public/${page}`);
  assert(html.includes(`https://specter-imaging.com/${page}`), `${page} canonical is missing or incorrect`);
  assert(!html.includes('\u2014') && !html.includes('&' + 'mdash;') && !html.includes('&#' + '8212;'), `forbidden em dash in ${page}`);
}

const eula = read('public/license-agreement.html');
assert(eula.includes('<strong>Version:</strong> 2.0'), 'Imaging EULA version must be 2.0');
assert(eula.includes('Adrian Stucker'), 'publisher identity is missing');
assert(/Nothing in this agreement limits rights granted by an applicable open-source license/i.test(eula), 'open-source carveout is missing');
assert(eula.includes('/terms-of-sale.html') && eula.includes('/privacy.html'), 'EULA cross-links are incomplete');

const terms = read('public/terms-of-sale.html');
const refunds = read('public/refund-policy.html');
const privacy = read('public/privacy.html');
assert(terms.includes('USD 49.99') && terms.includes('USD 349'), 'current product and bundle prices are missing');
assert(/14-day request period/i.test(refunds), '14-day refund request period is missing');
assert(privacy.includes('Local-first investigation data'), 'local-first application disclosure is missing');
assert(privacy.includes('Cloudflare Tunnel') && privacy.includes('Web Push'), 'optional remote-service disclosure is incomplete');
assert(privacy.includes('privacy-decline-analytics'), 'analytics withdrawal control is missing');

const index = read('public/index.html');
assert((index.match(/data-checkout-consent/g) || []).length === 3, 'Imaging, SDR, and Complete cards must each have clickwrap');
for (const link of ['/terms-of-sale.html', '/refund-policy.html', '/license-agreement.html', '/privacy.html', '/open-source.html']) {
  assert(index.includes(link), `homepage legal navigation is missing ${link}`);
}

const app = read('public/app.js');
assert(app.includes("if (!consent?.checked)"), 'client must block every unaccepted product checkout');
assert(!app.includes("product !== 'imaging'"), 'Imaging checkout must not bypass acceptance');
assert(app.includes('acceptedLegal: true'), 'accepted checkout must send an affirmative acceptance flag');

const checkout = read('netlify/functions/create-checkout.js');
assert(checkout.includes('LEGAL_VERSIONS'), 'server-controlled legal versions are missing');
assert(checkout.includes('body.acceptedLegal !== true'), 'server must reject every unaccepted checkout');
assert(checkout.includes("legal_accepted: 'true'"), 'server must record acceptance');
for (const field of ['legal_accepted_at', 'terms_version', 'eula_version', 'privacy_version', 'refund_version']) {
  assert(checkout.includes(field), `checkout metadata must record ${field}`);
}

const analytics = read('public/analytics-track.js');
assert(analytics.includes('specter_analytics_consent_v1'), 'analytics consent key is missing');
assert(analytics.includes("safeGet(consentKey) !== 'granted'"), 'analytics must not start before consent');
assert(analytics.includes('globalPrivacyControl') && analytics.includes('doNotTrack'), 'privacy signals are not honored');
assert(analytics.includes('clearAnalytics'), 'analytics identifier cleanup is missing');

const download = read('public/download.html');
const success = read('public/success.html');
const editorGuide = read('public/help/editors/index.html');
const openSource = read('public/open-source.html');
for (const page of [download, success, editorGuide]) assert(page.includes('SPECTER-Customer-Setup-12.49.4.exe'), 'every Imaging customer download path must use the immutable 12.49.4 installer');
assert(download.includes('674,359,376 bytes') && download.includes('cc050e9cf9f5c8875893e2463a4d8e92260bd43683d7a06a911197dcc5d8fb18'), 'download page must publish the verified Imaging installer size and checksum');
assert(openSource.includes('SPECTER-Imaging-Open-Source-Components-12.49.4.zip') && openSource.includes('cf7687b6e88f5808dd206390e62ea56746047cd11630b440651a851a84e76f08'), 'open-source page must publish the verified 12.49.4 source archive and checksum');
assert(!Array.from(walk(path.join(root, 'public'))).filter((file) => file.endsWith('.html')).some((file) => read(path.relative(root, file)).includes('releases/latest/download/SPECTER-Setup.exe')), 'stale generic Imaging installer links must be removed');

const expedition = read('public/specter-detection-system-expedition-x.html');
for (const phrase of ['SPECTER Detection System', 'Expedition X', 'Josh Gates', 'Heather Amaro', 'Phil Torres']) {
  assert(expedition.includes(phrase), `Expedition X landing page is missing ${phrase}`);
}
const indexHead = index.split('</head>')[0];
const indexBody = index.split('<body>')[1] || '';
for (const phrase of ['SPECTER Detection System', 'Expedition X', 'Josh Gates', 'Heather Amaro', 'Phil Torres']) assert(indexHead.includes(phrase), `homepage metadata is missing ${phrase}`);
assert(!indexBody.includes('Expedition X') && !indexBody.includes('Heather Amaro') && !indexBody.includes('Josh Gates') && !indexBody.includes('Phil Torres'), 'Expedition X references must not appear in visible homepage content');
assert(expedition.includes('https://specter-imaging.com/specter-detection-system-expedition-x.html'), 'Expedition X canonical URL is missing');
assert(expedition.includes('FAQPage') && expedition.includes('SoftwareApplication'), 'Expedition X structured data is incomplete');
assert(expedition.includes('/style.css?v=20260916-expedition-x') && expedition.includes('class="nav"') && expedition.includes('class="hero expedition-hero"'), 'Expedition X page must use the main marketing-site design system');
assert(!expedition.includes('/docs.css') && !expedition.includes('class="docs-layout"') && !expedition.includes('class="site-nav"'), 'Expedition X page must not fall back to the documentation design');
assert((expedition.match(/class="feature-card"/g) || []).length === 6, 'Expedition X page must present all six system capability cards');
assert(!expedition.includes('John Gates') && !expedition.includes('Phil Tores'), 'misspelled Expedition X names must not be published');
for (const rel of ['public/index.html', 'public/blog.html', 'public/help/index.html', 'public/download.html', 'public/support.html', 'public/site.webmanifest', 'public/llms.txt']) {
  const seo = read(rel);
  assert(seo.includes('SPECTER Detection System'), `${rel} is missing the product search alias`);
}
for (const rel of ['public/index.html', 'public/blog.html', 'public/help/index.html', 'public/llms.txt']) {
  const seo = read(rel);
  for (const phrase of ['Expedition X', 'Heather Amaro', 'Josh Gates', 'Phil Torres']) assert(seo.includes(phrase), `${rel} is missing ${phrase}`);
}
assert(read('public/download.html').includes('name="description"'), 'download page description is missing');
assert(read('public/help/index.html').includes('name="description"'), 'Help Center description is missing');
assert(read('public/support.html').includes('name="description"'), 'support page description is missing');
const netlifyConfig = read('netlify.toml');
for (const duplicate of ['/index.html', '/help/index.html', '/help/field-guide/']) assert(netlifyConfig.includes(`from = "${duplicate}"`), `canonical redirect missing for ${duplicate}`);

const sitemap = read('public/sitemap.xml');
assert(sitemap.includes('https://specter-imaging.com/specter-detection-system-expedition-x.html'), 'sitemap is missing the Expedition X landing page');
assert(sitemap.includes('<lastmod>2026-09-16</lastmod>'), 'sitemap freshness signal is missing');
for (const page of ['terms-of-sale.html', 'refund-policy.html', 'privacy.html', 'open-source.html']) {
  assert(sitemap.includes(`https://specter-imaging.com/${page}`), `sitemap is missing ${page}`);
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full); else yield full;
  }
}

console.log('Imaging sale-readiness tests PASS');
