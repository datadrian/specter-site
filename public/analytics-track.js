(function () {
  try {
    var nowMs = Date.now();
    var sessionKey = 'specter_sid';
    var tsKey = 'specter_sid_ts';
    var visitorKey = 'specter_vid';
    var utmKey = 'specter_utm';
    var firstSeenKey = 'specter_first_seen';
    var thirtyMinutes = 30 * 60 * 1000;

    function makeId(prefix) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return prefix + '_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
    }
    function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function safeRemove(k) { try { localStorage.removeItem(k); } catch (e) {} }
    function cookieGet(k) {
      try {
        var parts = document.cookie ? document.cookie.split(';') : [];
        for (var i = 0; i < parts.length; i++) {
          var bit = parts[i].trim();
          if (bit.indexOf(k + '=') === 0) return decodeURIComponent(bit.substring(k.length + 1));
        }
      } catch (e) {}
      return '';
    }
    function cookieSet(k, v, maxAge) {
      try { document.cookie = k + '=' + encodeURIComponent(v) + '; path=/; max-age=' + maxAge + '; SameSite=Lax; Secure'; } catch (e) {}
    }

    // A visitor ID persists for one year and is separate from the 30-minute
    // session ID. This is anonymous first-party analytics, not an account ID.
    var visitorId = safeGet(visitorKey) || cookieGet(visitorKey);
    if (!visitorId) visitorId = makeId('vid');
    safeSet(visitorKey, visitorId);
    cookieSet(visitorKey, visitorId, 365 * 24 * 60 * 60);

    var sessionId = safeGet(sessionKey) || cookieGet(sessionKey);
    var storedTs = safeGet(tsKey) || cookieGet(tsKey);
    var isExpired = true;
    if (storedTs) {
      var ts = parseInt(storedTs, 10);
      isExpired = isNaN(ts) || (nowMs - ts) > thirtyMinutes;
    }
    if (!sessionId || isExpired) {
      sessionId = makeId('sid');
      if (isExpired) safeRemove(utmKey);
    }
    safeSet(sessionKey, sessionId);
    safeSet(tsKey, String(nowMs));
    cookieSet(sessionKey, sessionId, 30 * 60);
    cookieSet(tsKey, String(nowMs), 30 * 60);

    var isReturningVisitor = false;
    var firstSeen = safeGet(firstSeenKey) || cookieGet(firstSeenKey);
    if (firstSeen) {
      isReturningVisitor = true;
    } else {
      safeSet(firstSeenKey, String(nowMs));
      cookieSet(firstSeenKey, String(nowMs), 365 * 24 * 60 * 60);
    }

    // UTM attribution: capture from the current URL if present, otherwise fall back to
    // whatever was captured earlier in this same session (so a campaign link's tags stick
    // even as the visitor browses to pages without the query string).
    var utm = { utmSource: '', utmMedium: '', utmCampaign: '' };
    try {
      var qp = new URLSearchParams(window.location.search);
      var hasUtm = qp.has('utm_source') || qp.has('utm_medium') || qp.has('utm_campaign');
      if (hasUtm) {
        utm.utmSource = qp.get('utm_source') || '';
        utm.utmMedium = qp.get('utm_medium') || '';
        utm.utmCampaign = qp.get('utm_campaign') || '';
        safeSet(utmKey, JSON.stringify(utm));
      } else {
        var stored = safeGet(utmKey);
        if (stored) {
          var parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object') utm = parsed;
        }
      }
    } catch (e) {}

    var pageviewPayload = {
      type: 'pageview',
      path: window.location.pathname,
      referrer: document.referrer || '',
      sessionId: sessionId,
      visitorId: visitorId,
      timestamp: new Date().toISOString(),
      isReturningVisitor: isReturningVisitor,
      utmSource: utm.utmSource,
      utmMedium: utm.utmMedium,
      utmCampaign: utm.utmCampaign
    };

    if (typeof fetch === 'function') {
      fetch('/api/track-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pageviewPayload),
        keepalive: true
      }).catch(function () {});
    }

    var startTime = Date.now();
    var heartbeatSent = false;

    function sendHeartbeat() {
      if (heartbeatSent) return;
      heartbeatSent = true;

      var durationMs = Date.now() - startTime;
      var heartbeatPayload = {
        type: 'session_heartbeat',
        path: window.location.pathname,
        sessionId: sessionId,
        durationMs: durationMs,
        timestamp: new Date().toISOString()
      };

      var payloadString = JSON.stringify(heartbeatPayload);

      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/api/track-event', payloadString);
      } else if (typeof fetch === 'function') {
        fetch('/api/track-event', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: payloadString,
          keepalive: true
        }).catch(function () {});
      }
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        sendHeartbeat();
      }
    });

    window.addEventListener('pagehide', function () {
      sendHeartbeat();
    });

    window.addEventListener('beforeunload', function () {
      sendHeartbeat();
    });

    window.specterTrackDownload = function (label) {
      try {
        var downloadPayload = {
          type: 'download',
          path: window.location.pathname,
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          referrer: label || ''
        };

        var payloadString = JSON.stringify(downloadPayload);

        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon('/api/track-event', payloadString);
        } else if (typeof fetch === 'function') {
          fetch('/api/track-event', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: payloadString,
            keepalive: true
          }).catch(function () {});
        }
      } catch (err) {
        // Suppress errors to avoid breaking the page
      }
    };

  } catch (e) {
    // Suppress all errors to prevent breaking the client site
  }
})();
