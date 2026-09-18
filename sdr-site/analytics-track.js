(function () {
  'use strict';
  var consentKey = 'specter_analytics_consent_v1';
  var optOutKey = 'specter_analytics_opt_out_v1';
  var stopped = false;
  var analyticsKeys = ['specter_sid', 'specter_sid_ts', 'specter_vid', 'specter_utm', 'specter_first_seen'];
  function safeGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function clearAnalytics() {
    analyticsKeys.forEach(function (key) {
      try { localStorage.removeItem(key); } catch (_) {}
      // Expire identifiers left by the retired tracker; never read or transmit their values.
      try { document.cookie = key + '=; path=/; max-age=0; SameSite=Lax; Secure'; } catch (_) {}
    });
  }
  function privacySignal() { return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1'; }
  function optedOut() { return stopped || privacySignal() || safeGet(optOutKey) === '1' || safeGet(consentKey) === 'denied'; }
  function post(type) {
    if (optedOut() || location.pathname.indexOf('/admin') === 0) return;
    try {
      fetch('/api/track-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', body: JSON.stringify({ type: type, path: location.pathname }), keepalive: true }).catch(function () {});
    } catch (_) {}
  }
  function showStatus() {
    var status = document.getElementById('privacy-consent-status');
    if (status) status.textContent = optedOut() ? 'Anonymous counting is off in this browser.' : 'Anonymous page and download-click counting is on. No visitor or session identifiers are used.';
  }
  function optOut() {
    stopped = true;
    try { localStorage.setItem(optOutKey, '1'); } catch (_) {}
    clearAnalytics();showStatus();
  }
  function ready() {
    clearAnalytics();
    // An inline notice, not a popup or a request for consent.
    if (!document.getElementById('anonymous-analytics-notice') && location.pathname.indexOf('/admin') !== 0) {
      var notice = document.createElement('p');notice.id = 'anonymous-analytics-notice';
      notice.style.cssText = 'padding:12px 20px;margin:0;text-align:center;font-size:12px;line-height:1.6;color:inherit;';
      notice.innerHTML = 'Anonymous page and download-click counts help improve this site. <a style="color:inherit;text-decoration:underline" href="/privacy#website-analytics">Privacy and opt out</a>.';
      document.body.appendChild(notice);
    }
    document.getElementById('privacy-decline-analytics')?.addEventListener('click', optOut);
    showStatus();
    window.specterTrackDownload = function () { post('download'); };
    post('pageview');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
}());
