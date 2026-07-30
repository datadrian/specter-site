const { json, corsPreflight, readJson } = require('./_lib/http');
const { configureStore, recordEvent } = require('./_lib/analytics-store');

// Netlify populates x-nf-geo on requests that pass through its edge network with
// base64-encoded JSON geolocation data. Not guaranteed present on every plan/setup,
// so this degrades to 'unknown' rather than guessing - same pattern used elsewhere
// in this codebase for "no data found" cases.
function parseGeo(event) {
  try {
    const raw = event.headers?.['x-nf-geo'] || event.headers?.['X-Nf-Geo'];
    if (!raw) return { country: '', city: '' };
    const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return {
      country: decoded?.country?.code || decoded?.country?.name || '',
      city: decoded?.city || '',
    };
  } catch (_) {
    return { country: '', city: '' };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return corsPreflight();
  }
  
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }
  
  try {
    configureStore(event);
    
    const body = readJson(event);
    const { type, path, referrer, sessionId, visitorId, durationMs, timestamp, isReturningVisitor, utmSource, utmMedium, utmCampaign } = body;
    
    // Basic validation. If invalid, we respond with 200 ok: true but do not store.
    const allowedTypes = ['pageview', 'download', 'session_heartbeat'];
    if (!type || !allowedTypes.includes(type)) {
      return json(200, { ok: true, skipped: 'Invalid or missing type' });
    }
    
    if (typeof path !== 'string') {
      return json(200, { ok: true, skipped: 'Invalid path' });
    }
    
    // Determine timestamp
    let ts = new Date().toISOString();
    if (timestamp) {
      try {
        const d = new Date(timestamp);
        if (!isNaN(d.getTime())) {
          ts = d.toISOString();
        }
      } catch (_) {}
    }
    
    const userAgent = event.headers?.['user-agent'] || event.headers?.['User-Agent'] || '';
    const geo = parseGeo(event);
    
    const eventObj = {
      type,
      path: path.trim(),
      referrer: typeof referrer === 'string' ? referrer.trim() : '',
      sessionId: typeof sessionId === 'string' ? sessionId.trim().slice(0, 100) : '',
      visitorId: typeof visitorId === 'string' ? visitorId.trim().slice(0, 100) : '',
      ts,
      userAgent,
      country: geo.country,
    };
    
    if (durationMs !== undefined && durationMs !== null && !isNaN(durationMs)) {
      eventObj.durationMs = Number(durationMs);
    }
    
    if (type === 'pageview') {
      eventObj.isReturningVisitor = Boolean(isReturningVisitor);
      eventObj.utmSource = typeof utmSource === 'string' ? utmSource.trim().slice(0, 100) : '';
      eventObj.utmMedium = typeof utmMedium === 'string' ? utmMedium.trim().slice(0, 100) : '';
      eventObj.utmCampaign = typeof utmCampaign === 'string' ? utmCampaign.trim().slice(0, 100) : '';
    }
    
    await recordEvent(eventObj);
    
    return json(200, { ok: true });
  } catch (err) {
    console.error('[track-event] Error processing event:', err);
    // Never crash the public tracking script, always return 200 with ok: true
    return json(200, { ok: true, error: 'Internal processing error' });
  }
};
