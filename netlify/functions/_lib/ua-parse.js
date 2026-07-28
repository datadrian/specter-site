// Lightweight, dependency-free User-Agent classifier. Not exhaustive, but covers
// the vast majority of real traffic (desktop/mobile/tablet, major browsers, major OSes).
function parseUserAgent(ua) {
  const s = (ua || '').toLowerCase();

  let device = 'Desktop';
  if (/ipad|tablet(?!.*mobile)/.test(s)) {
    device = 'Tablet';
  } else if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(s)) {
    device = 'Mobile';
  } else if (/android/.test(s)) {
    // Android without "mobile" token is typically a tablet
    device = 'Tablet';
  }

  let browser = 'Other';
  if (/edg\//.test(s)) browser = 'Edge';
  else if (/opr\/|opera/.test(s)) browser = 'Opera';
  else if (/samsungbrowser/.test(s)) browser = 'Samsung Internet';
  else if (/firefox\//.test(s)) browser = 'Firefox';
  else if (/crios\//.test(s)) browser = 'Chrome (iOS)';
  else if (/chrome\//.test(s) && !/edg\//.test(s)) browser = 'Chrome';
  else if (/fxios\//.test(s)) browser = 'Firefox (iOS)';
  else if (/safari\//.test(s) && /version\//.test(s)) browser = 'Safari';
  else if (!s) browser = 'Unknown';

  let os = 'Other';
  if (/windows nt/.test(s)) os = 'Windows';
  else if (/mac os x|macintosh/.test(s) && !/iphone|ipad|ipod/.test(s)) os = 'macOS';
  else if (/iphone|ipad|ipod/.test(s)) os = 'iOS';
  else if (/android/.test(s)) os = 'Android';
  else if (/linux/.test(s)) os = 'Linux';
  else if (!s) os = 'Unknown';

  return { device, browser, os };
}

module.exports = { parseUserAgent };
