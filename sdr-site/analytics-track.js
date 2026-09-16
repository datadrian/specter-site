(function () {
  'use strict';
  var consentKey = 'specter_analytics_consent_v1';
  var analyticsKeys = ['specter_sid', 'specter_sid_ts', 'specter_vid', 'specter_utm', 'specter_first_seen'];
  var started = false;

  function safeGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  function safeRemove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  function eraseCookie(key) { try { document.cookie = key + '=; path=/; max-age=0; SameSite=Lax; Secure'; } catch (_) {} }
  function clearAnalytics() { analyticsKeys.forEach(function (key) { safeRemove(key); eraseCookie(key); }); }
  function privacySignal() { return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1'; }
  function makeId(prefix) { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : prefix + '_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36); }
  function cookieGet(key) { try { var part = document.cookie.split(';').map(function (x) { return x.trim(); }).find(function (x) { return x.indexOf(key + '=') === 0; }); return part ? decodeURIComponent(part.slice(key.length + 1)) : ''; } catch (_) { return ''; } }
  function cookieSet(key, value, maxAge) { try { document.cookie = key + '=' + encodeURIComponent(value) + '; path=/; max-age=' + maxAge + '; SameSite=Lax; Secure'; } catch (_) {} }
  function post(payload) { try { fetch('/api/track-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(function () {}); } catch (_) {} }

  function startAnalytics() {
    if (started || safeGet(consentKey) !== 'granted' || privacySignal()) return;
    started = true;
    var now = Date.now();
    var visitorId = safeGet('specter_vid') || cookieGet('specter_vid') || makeId('vid');
    safeSet('specter_vid', visitorId); cookieSet('specter_vid', visitorId, 365 * 24 * 60 * 60);
    var sessionId = safeGet('specter_sid') || cookieGet('specter_sid');
    var prior = Number(safeGet('specter_sid_ts') || cookieGet('specter_sid_ts'));
    if (!sessionId || !Number.isFinite(prior) || now - prior > 30 * 60 * 1000) sessionId = makeId('sid');
    safeSet('specter_sid', sessionId); safeSet('specter_sid_ts', String(now));
    cookieSet('specter_sid', sessionId, 30 * 60); cookieSet('specter_sid_ts', String(now), 30 * 60);
    var firstSeen = safeGet('specter_first_seen') || cookieGet('specter_first_seen');
    if (!firstSeen) { safeSet('specter_first_seen', String(now)); cookieSet('specter_first_seen', String(now), 365 * 24 * 60 * 60); }
    var query = new URLSearchParams(location.search);
    var utm = { utmSource: query.get('utm_source') || '', utmMedium: query.get('utm_medium') || '', utmCampaign: query.get('utm_campaign') || '' };
    if (utm.utmSource || utm.utmMedium || utm.utmCampaign) safeSet('specter_utm', JSON.stringify(utm));
    else { try { utm = JSON.parse(safeGet('specter_utm') || '{}'); } catch (_) {} }
    post({ type: 'pageview', path: location.pathname, referrer: document.referrer || '', sessionId: sessionId, visitorId: visitorId, timestamp: new Date().toISOString(), isReturningVisitor: !!firstSeen, utmSource: utm.utmSource || '', utmMedium: utm.utmMedium || '', utmCampaign: utm.utmCampaign || '' });
    var start = Date.now(), sent = false;
    function heartbeat() { if (sent) return; sent = true; post({ type: 'session_heartbeat', path: location.pathname, sessionId: sessionId, durationMs: Date.now() - start, timestamp: new Date().toISOString() }); }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') heartbeat(); });
    window.addEventListener('pagehide', heartbeat);
    window.specterTrackDownload = function (label) { post({ type: 'download', path: location.pathname, sessionId: sessionId, timestamp: new Date().toISOString(), referrer: label || '' }); };
  }

  function decide(value) {
    safeSet(consentKey, value);
    if (value !== 'granted') clearAnalytics();
    document.querySelector('.analytics-consent')?.remove();
    var status = document.getElementById('privacy-consent-status');
    if (status) status.textContent = value === 'granted' ? 'Analytics accepted.' : 'Analytics declined and local identifiers cleared.';
    if (value === 'granted') startAnalytics();
  }

  function showBanner() {
    if (safeGet(consentKey) || privacySignal()) return;
    var panel = document.createElement('section');
    panel.className = 'analytics-consent'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Analytics choice');
    panel.innerHTML = '<p><strong>OPTIONAL ANALYTICS</strong><br>SPECTER uses first-party analytics only if you agree. It helps measure page and download activity and is not used for cross-site advertising. <a href="/privacy">Privacy details</a>.</p><div class="analytics-consent-actions"><button type="button" class="btn-primary" data-analytics-accept>ACCEPT ANALYTICS</button><button type="button" class="btn-ghost" data-analytics-decline>DECLINE</button></div>';
    document.body.appendChild(panel);
    panel.querySelector('[data-analytics-accept]').onclick = function () { decide('granted'); };
    panel.querySelector('[data-analytics-decline]').onclick = function () { decide('denied'); };
  }

  function ready() {
    if (!safeGet(consentKey)) clearAnalytics();
    if (privacySignal()) { clearAnalytics(); safeSet(consentKey, 'denied'); }
    document.getElementById('privacy-decline-analytics')?.addEventListener('click', function () { decide('denied'); });
    if (safeGet(consentKey) === 'granted') startAnalytics(); else showBanner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
}());
