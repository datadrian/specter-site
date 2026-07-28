(function () {
  try {
    var nowMs = Date.now();
    var sessionKey = 'specter_sid';
    var tsKey = 'specter_sid_ts';
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
    }
    localStorage.setItem(tsKey, nowMs.toString());

    var pageviewPayload = {
      type: 'pageview',
      path: window.location.pathname,
      referrer: document.referrer || '',
      sessionId: sessionId,
      timestamp: new Date().toISOString()
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