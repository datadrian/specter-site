const { json, corsPreflight, readJson } = require('./_lib/http');
const { configureStore, recordEvent } = require('./_lib/analytics-store');

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
    const { type, path, referrer, sessionId, durationMs, timestamp } = body;
    
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
    
    const eventObj = {
      type,
      path: path.trim(),
      referrer: typeof referrer === 'string' ? referrer.trim() : '',
      sessionId: typeof sessionId === 'string' ? sessionId.trim() : '',
      ts,
      userAgent,
    };
    
    if (durationMs !== undefined && durationMs !== null && !isNaN(durationMs)) {
      eventObj.durationMs = Number(durationMs);
    }
    
    await recordEvent(eventObj);
    
    return json(200, { ok: true });
  } catch (err) {
    console.error('[track-event] Error processing event:', err);
    // Never crash the public tracking script, always return 200 with ok: true
    return json(200, { ok: true, error: 'Internal processing error' });
  }
};
