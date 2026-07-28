(function () {
  try {
    var nowMs = Date.now();
    var sessionKey = 'specter_sid';
    var tsKey = 'specter_sid_ts';
    var utmKey = 'specter_utm';
    var firstSeenKey = 'specter_first_seen';
    var thirtyMinutes = 30 * 60 * 1000;

    var sessionId = localStorage.getItem(sessionKey);
    var storedTs = localStorage.getItem(tsKey);

    var isExpired = false;
    if (storedTs) {
      var ts = parseInt(storedTs, 10);
      if (isNaN(ts) || (nowMs - ts) > thirtyMinutes) {
        isExpired = true;
      }
    } else {
      isExpired = true;
    }

    if (!sessionId || isExpired) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        sessionId = crypto.randomUUID();
      } else {
        sessionId = 'sid_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
      }
      localStorage.setItem(sessionKey, sessionId);
      // A fresh session also clears any stale UTM attribution from a previous session.
      if (isExpired) localStorage.removeItem(utmKey);
    }
    localStorage.setItem(tsKey, nowMs.toString());

    // Returning visitor = has this browser ever recorded a pageview before, regardless
    // of session expiry. Separate, non-expiring marker so it survives across sessions.
    var isReturningVisitor = false;
    try {
      if (localStorage.getItem(firstSeenKey)) {
        isReturningVisitor = true;
      } else {
        localStorage.setItem(firstSeenKey, String(nowMs));
      }
    } catch (e) {}

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
        localStorage.setItem(utmKey, JSON.stringify(utm));
      } else {
        var stored = localStorage.getItem(utmKey);
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
