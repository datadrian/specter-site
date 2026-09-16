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
assert(terms.includes('USD 199') && terms.includes('USD 349'), 'current product and bundle prices are missing');
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

const sitemap = read('public/sitemap.xml');
for (const page of ['terms-of-sale.html', 'refund-policy.html', 'privacy.html', 'open-source.html']) {
  assert(sitemap.includes(`https://specter-imaging.com/${page}`), `sitemap is missing ${page}`);
}

console.log('Imaging sale-readiness tests PASS');
