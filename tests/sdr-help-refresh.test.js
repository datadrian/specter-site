const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'sdr-site');
const paths = require('../netlify/functions/_lib/analytics-public-paths.json').sdr;
const pages = fs.readdirSync(path.join(root, 'help')).filter(x => x.endsWith('.html'));
assert(pages.length >= 22, 'All existing guides and new workflows must remain available');
for (const name of pages) {
  const text = fs.readFileSync(path.join(root, 'help', name), 'utf8');
  assert(!text.includes(String.fromCharCode(8212)) && !text.includes('&' + 'mdash;') && !text.includes('&#' + '8212;'), `${name}: forbidden punctuation`);
  assert(!/producer|talent tools|secret menu|ghost injection|profile injection|session arcs|auto-hits|ghost-capture/i.test(text), `${name}: non-public vocabulary`);
  assert(text.includes('2026-09-24'), `${name}: review date`);
  for (const slug of ['channel-activity', 'radiation', 'whats-new']) assert(text.includes(`/help/${slug}`), `${name}: missing navigation ${slug}`);
  assert(text.includes('aria-current="page"'), `${name}: active navigation`);
  for (const match of text.matchAll(/href="(\/help\/[^"#?]*)(?:#[^"]*)?"/g)) {
    const route = match[1];
    const local = route === '/help/' ? 'help/index.html' : route.slice(1) + (route.endsWith('.html') ? '' : '.html');
    assert(fs.existsSync(path.join(root, local)), `${name}: broken link ${route}`);
  }
}
const read = slug => fs.readFileSync(path.join(root, 'help', slug + '.html'), 'utf8');
assert(read('licensing').includes('30 minutes from first launch'));
assert(!read('licensing').includes('10-minute'));
assert(!read('tinysa').includes('450, or 900'));
assert(read('tinysa').includes('5200 MHz'));
assert(read('receiver-setup').includes('GIVE UNIQUE SERIAL'));
assert(read('channel-activity').includes('Record the audio on'));
assert(read('channel-activity').includes('1.5 seconds'));
assert(read('channel-activity').includes('10 minutes'));
assert(read('recording-alerts').includes('v1.7.41 behavior'));
assert(read('whats-new').includes('public release is <strong>v1.7.41'));
assert(read('whats-new').includes('included in that public release'));
assert(!read('whats-new').includes('not yet listed'));
for (const slug of ['channel-activity', 'radiation', 'whats-new']) {
  assert(paths.includes(`/help/${slug}`));
  assert(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').includes(`/help/${slug}</loc>`));
}
console.log(`PASS ${pages.length} SDR help pages, navigation, version boundaries, public terminology and corrected feature limits`);
