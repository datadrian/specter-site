(function () {
  const API = '/api';
  const TOKEN_KEY = 'specter_admin_token';
  let token = sessionStorage.getItem(TOKEN_KEY) || '';
  let licensesCache = [];
  let ticketsCache = [];

  const $ = (id) => document.getElementById(id);

  function authHeaders() {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  async function api(path, opts = {}) {
    const res = await fetch(`${API}/${path}`, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { logout(); throw new Error('Session expired.'); }
    if (!res.ok && !data.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  // Shared feedback wrapper for every button that triggers a write: disables the
  // button, shows a brief green/red flash on success/failure, and surfaces the
  // error instead of failing silently. Blobs (the storage backing every write
  // here) has a brief read-after-write lag, so callers should also `await
  // settle()` before re-fetching - without it, a refresh can show stale data
  // and make a working button look like it did nothing.
  async function runWithFeedback(btn, fn, opts = {}) {
    if (!btn) return fn();
    const original = btn.textContent;
    if (opts.busyText) btn.textContent = opts.busyText;
    btn.disabled = true;
    try {
      const result = await fn();
      btn.classList.remove('btn-flash-err');
      btn.classList.add('btn-flash-ok');
      setTimeout(() => btn.classList.remove('btn-flash-ok'), 900);
      return result;
    } catch (e) {
      btn.classList.remove('btn-flash-ok');
      btn.classList.add('btn-flash-err');
      setTimeout(() => btn.classList.remove('btn-flash-err'), 1300);
      alert(`Action failed: ${e.message || 'Unknown error'}`);
      throw e;
    } finally {
      btn.disabled = false;
      if (opts.busyText) btn.textContent = original;
    }
  }

  function settle(ms = 1200) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ---- Agent console widget (top-right, always visible) ----
  let agentConsoleCollapsed = false;
  let agentLogPollTimer = null;

  function fmtLogTime(iso) {
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
  }

  async function pollAgentLog() {
    try {
      const data = await api('admin-outreach-agent-log?limit=40');
      const entries = data.entries || [];
      const body = $('agent-console-body');
      if (body) {
        body.innerHTML = entries.length
          ? entries.map(e => `<div class="agent-console-line level-${esc(e.level)}"><span class="ts">${fmtLogTime(e.ts)}</span>${esc(e.message)}</div>`).join('')
          : '<div class="agent-console-empty">No activity logged yet.</div>';
      }
      const dot = $('agent-console-dot');
      if (dot) {
        const latest = entries[0];
        const recent = latest && (Date.now() - new Date(latest.ts).getTime()) < 2 * 60 * 1000;
        dot.classList.toggle('active', Boolean(recent));
      }
    } catch (e) {
      // quiet failure, this widget shouldn't interrupt the rest of the console
      console.warn('[agent-console]', e.message);
    }
  }

  function startAgentConsolePolling() {
    pollAgentLog();
    if (agentLogPollTimer) clearInterval(agentLogPollTimer);
    agentLogPollTimer = setInterval(pollAgentLog, 6000);
  }

  const consoleToggleBtn = document.getElementById('agent-console-toggle');
  if (consoleToggleBtn) {
    consoleToggleBtn.addEventListener('click', () => {
      agentConsoleCollapsed = !agentConsoleCollapsed;
      $('agent-console').classList.toggle('collapsed', agentConsoleCollapsed);
      consoleToggleBtn.textContent = agentConsoleCollapsed ? '+' : '_';
    });
  }

  // ---- Auto-posting stop/resume ----
  async function refreshAutopostStatus() {
    try {
      const data = await api('admin-outreach-settings');
      const paused = Boolean(data.settings && data.settings.autoPostPaused);
      const label = $('autopost-status-label');
      if (label) label.textContent = `Auto-posting: ${paused ? 'PAUSED' : 'RUNNING'}`;
      const stopBtn = $('autopost-stop-btn');
      const resumeBtn = $('autopost-resume-btn');
      if (stopBtn) stopBtn.classList.toggle('hidden', paused);
      if (resumeBtn) resumeBtn.classList.toggle('hidden', !paused);
    } catch (e) {
      console.warn('[autopost-status]', e.message);
    }
  }

  const stopBtnEl = document.getElementById('autopost-stop-btn');
  if (stopBtnEl) {
    stopBtnEl.addEventListener('click', async () => {
      if (!confirm('Stop the auto-poster immediately? No new auto-posts will go out until you resume.')) return;
      await api('admin-outreach-settings', { method: 'PATCH', body: JSON.stringify({ autoPostPaused: true }) });
      await refreshAutopostStatus();
    });
  }
  const resumeBtnEl = document.getElementById('autopost-resume-btn');
  if (resumeBtnEl) {
    resumeBtnEl.addEventListener('click', async () => {
      await api('admin-outreach-settings', { method: 'PATCH', body: JSON.stringify({ autoPostPaused: false }) });
      await refreshAutopostStatus();
    });
  }

  function initialPanel() {
    const target = `${location.pathname} ${location.hash}`.toLowerCase();
    if (target.includes('ticket')) return 'tickets';
    if (target.includes('mint')) return 'mint';
    if (target.includes('replace')) return 'replacement';
    if (target.includes('license') || target.includes('licence')) return 'licenses';
    return 'dashboard';
  }

  function activatePanel(panel) {
    const btn = document.querySelector(`.sidebar button[data-panel="${panel}"]`);
    const panelEl = $(`panel-${panel}`);
    if (!btn || !panelEl) return activatePanel('dashboard');

    document.querySelectorAll('.sidebar button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    panelEl.classList.add('active');

    if (panel === 'dashboard') loadDashboard();
    if (panel === 'licenses') loadLicenses();
    if (panel === 'tickets') loadTickets();
    if (panel === 'outreach') loadOutreach();
    if (panel === 'analytics') loadAnalytics();
  }

  function showApp() {
    $('login-view').classList.add('hidden');
    $('app-view').classList.remove('hidden');
    activatePanel(initialPanel());
    startAgentConsolePolling();
  }

  function logout() {
    token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    $('app-view').classList.add('hidden');
    $('login-view').classList.remove('hidden');
  }

  $('login-btn').addEventListener('click', async () => {
    const password = $('login-password').value;
    $('login-error').classList.add('hidden');
    try {
      const res = await fetch(`${API}/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Login failed');
      token = data.token;
      sessionStorage.setItem(TOKEN_KEY, token);
      showApp();
    } catch (e) {
      $('login-error').textContent = e.message;
      $('login-error').classList.remove('hidden');
    }
  });

  $('logout-btn').addEventListener('click', logout);

  document.querySelectorAll('.sidebar button').forEach(btn => {
    btn.addEventListener('click', () => {
      activatePanel(btn.dataset.panel);
    });
  });

  async function loadDashboard() {
    const data = await api('admin-dashboard');
    const s = data.licenses;
    const t = data.tickets;
    const o = data.outreach || {};
    $('stats-grid').innerHTML = `
      <div class="stat"><div class="stat-n">${s.total}</div><div class="stat-l">TOTAL KEYS</div></div>
      <div class="stat"><div class="stat-n">${s.activated}</div><div class="stat-l">ACTIVATED</div></div>
      <div class="stat"><div class="stat-n">${s.unactivated}</div><div class="stat-l">UNACTIVATED</div></div>
      <div class="stat"><div class="stat-n">${s.imaging || 0}</div><div class="stat-l">IMAGING KEYS</div></div>
      <div class="stat"><div class="stat-n">${s.sdr || 0}</div><div class="stat-l">SDR KEYS</div></div>
      <div class="stat"><div class="stat-n">${s.comp}</div><div class="stat-l">COMP KEYS</div></div>
      <div class="stat"><div class="stat-n">${s.replacement || 0}</div><div class="stat-l">REPLACEMENTS</div></div>
      <div class="stat"><div class="stat-n">${t.open}</div><div class="stat-l">OPEN TICKETS</div></div>
      <div class="stat"><div class="stat-n">${t.total}</div><div class="stat-l">ALL TICKETS</div></div>
      <div class="stat"><div class="stat-n">${o.needsReview || 0}</div><div class="stat-l">COMMUNITIES TO VET</div></div>
      <div class="stat"><div class="stat-n">${o.pendingDrafts || 0}</div><div class="stat-l">DRAFTS TO REVIEW</div></div>
      <div class="stat"><div class="stat-n">${o.allowlisted || 0}</div><div class="stat-l">ALLOW-LISTED</div></div>
      <div class="stat"><div class="stat-n">${(data.analytics && data.analytics.todayPageviews) || 0}</div><div class="stat-l">PAGEVIEWS TODAY</div></div>
      <div class="stat"><div class="stat-n">${(data.analytics && data.analytics.todayDownloads) || 0}</div><div class="stat-l">DOWNLOADS TODAY</div></div>
    `;
  }

  async function loadLicenses() {
    const data = await api('admin-licenses');
    licensesCache = data.licenses || [];
    renderLicenses();
  }

  function renderLicenses() {
    const q = ($('license-search').value || '').toLowerCase();
    const rows = licensesCache.filter(r =>
      !q || (r.email || '').toLowerCase().includes(q) || (r.key || '').toLowerCase().includes(q) || (r.product || 'imaging').includes(q)
    );
    $('licenses-body').innerHTML = rows.map(r => `
      <tr>
        <td><code>${r.key}</code></td>
        <td><span class="badge">${(r.product || 'imaging').toUpperCase()}</span></td>
        <td><span class="badge ${r.type || 'retail'}">${r.type || 'retail'}</span></td>
        <td>${esc(r.email || '-')}</td>
        <td>${r.machineId || '-'}</td>
        <td>${fmtDate(r.purchasedAt)}</td>
        <td>${r.activatedAt ? fmtDate(r.activatedAt) : '-'}</td>
        <td>${esc(licenseNote(r))}</td>
        <td>
          ${(r.type || 'retail') === 'comp' || r.type === 'dev'
            ? ''
            : `<button type="button" class="btn secondary" data-replace-key="${r.key}" data-replace-email="${escAttr(r.email || '')}">Replace</button>`}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="9">No licenses yet</td></tr>';

    $('licenses-body').querySelectorAll('[data-replace-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        $('replace-original-key').value = btn.dataset.replaceKey;
        $('replace-email').value = btn.dataset.replaceEmail || '';
        $('replace-note').value = 'Replacement requested by customer';
        activatePanel('replacement');
      });
    });
  }

  $('refresh-licenses').addEventListener('click', loadLicenses);
  $('license-search').addEventListener('input', renderLicenses);

  async function loadTickets() {
    const data = await api('admin-tickets');
    ticketsCache = data.tickets || [];
    renderTickets();
  }

  function renderTickets() {
    const f = $('ticket-filter').value;
    const rows = ticketsCache.filter(t => !f || t.status === f);
    $('tickets-body').innerHTML = rows.map(t => `
      <tr>
        <td><code>${t.id}</code></td>
        <td><span class="badge ${t.status}">${t.status}</span></td>
        <td>${esc(t.subject)}</td>
        <td>${esc(t.email)}</td>
        <td>${fmtDate(t.updatedAt)}</td>
        <td><button type="button" class="btn secondary" data-open="${t.id}">Open</button></td>
      </tr>
    `).join('') || '<tr><td colspan="6">No tickets</td></tr>';

    $('tickets-body').querySelectorAll('[data-open]').forEach(btn => {
      btn.addEventListener('click', () => openTicket(btn.dataset.open));
    });
  }

  async function openTicket(id) {
    const data = await api(`admin-tickets?id=${encodeURIComponent(id)}`);
    const t = data.ticket;
    const el = $('ticket-detail');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <div><strong>${t.id}</strong> · ${esc(t.email)} · <span class="badge ${t.status}">${t.status}</span></div>
        <div>
          <button type="button" class="btn secondary" data-status="waiting">Mark waiting</button>
          <button type="button" class="btn secondary" data-status="closed">Close</button>
        </div>
      </div>
      <div>${(t.messages || []).map(m => `
        <div class="msg ${m.from === 'staff' ? 'staff' : 'customer'}">
          <div class="msg-meta">${m.from} · ${fmtDate(m.at)}</div>
          ${esc(m.body).replace(/\n/g, '<br>')}
        </div>`).join('')}</div>
      <div class="reply-box" style="margin-top:16px">
        <textarea id="reply-text" placeholder="Reply to customer…"></textarea>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button type="button" class="btn" id="send-reply">Send reply + email</button>
        </div>
      </div>`;

    el.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api(`admin-tickets?id=${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: btn.dataset.status }),
        });
        loadTickets();
        openTicket(id);
      });
    });

    el.querySelector('#send-reply').addEventListener('click', async () => {
      const message = el.querySelector('#reply-text').value.trim();
      if (!message) return;
      await api(`admin-tickets?id=${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({ message, sendEmail: true }),
      });
      loadTickets();
      openTicket(id);
    });
  }

  $('refresh-tickets').addEventListener('click', loadTickets);
  $('ticket-filter').addEventListener('change', renderTickets);

  $('mint-btn').addEventListener('click', async () => {
    const data = await api('admin-licenses', {
      method: 'POST',
      body: JSON.stringify({
        email: $('mint-email').value.trim() || undefined,
        note: $('mint-note').value.trim(),
        type: $('mint-type').value,
        product: $('mint-product').value,
      }),
    });
    const box = $('mint-result');
    box.classList.remove('hidden');
    box.innerHTML = `<strong>Product:</strong> ${(data.license.product || 'imaging').toUpperCase()}<br><strong>Key:</strong> <code>${data.license.key}</code><br>
      ${data.emailSent ? 'Emailed to recipient.' : 'Copy the key, no email sent.'}`;
    loadDashboard();
  });

  $('replace-btn').addEventListener('click', issueReplacement);

  async function issueReplacement() {
    const originalKey = $('replace-original-key').value.trim();
    const email = $('replace-email').value.trim();
    const note = $('replace-note').value.trim();
    const box = $('replace-result');
    box.classList.add('hidden');

    if (!originalKey && !email) {
      box.classList.remove('hidden');
      box.innerHTML = 'Enter either the original key or the purchase email.';
      return;
    }

    try {
      const data = await api('admin-licenses', {
        method: 'POST',
        body: JSON.stringify({
          action: 'replacement',
          originalKey,
          email,
          note,
        }),
      });

      box.classList.remove('hidden');
      box.innerHTML = `<strong>Product:</strong> ${(data.license.product || 'imaging').toUpperCase()}<br><strong>Replacement key:</strong> <code>${data.license.key}</code><br>
        <strong>Original:</strong> <code>${data.original.key}</code><br>
        ${data.emailSent ? 'Emailed to purchaser.' : 'Copy the key, email was not sent.'}`;

      loadDashboard();
      loadLicenses();
    } catch (e) {
      box.classList.remove('hidden');
      box.innerHTML = esc(e.message || 'Could not issue replacement key.');
    }
  }

  function fmtDate(iso) {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escAttr(s) {
    return esc(s).replace(/"/g, '&quot;');
  }

  function licenseNote(r) {
    const parts = [];
    if (r.note) parts.push(r.note);
    if (r.replacementFor) parts.push(`replaces ${r.replacementFor}`);
    if (r.replacedBy) parts.push(`replaced by ${r.replacedBy}`);
    return parts.join(' · ');
  }


  // ---- Outreach ----
  let communitiesCache = [];
  let draftsCache = [];
  let outreachSubTab = 'communities';

  document.querySelectorAll('.outreach-sub-tabs button').forEach(btn => {
    btn.addEventListener('click', () => activateOutreachSub(btn.dataset.sub));
  });

  function activateOutreachSub(sub) {
    outreachSubTab = sub;
    document.querySelectorAll('.outreach-sub-tabs button').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
    document.querySelectorAll('.outreach-sub-panel').forEach(p => p.classList.toggle('active', p.id === `outreach-sub-${sub}`));
    if (sub === 'communities') loadCommunities();
    if (sub === 'drafts') loadDrafts();
    if (sub === 'postlog') loadPostlog();
  }

  function loadOutreach() {
    activateOutreachSub(outreachSubTab);
    refreshAutopostStatus();
  }

  async function runOutreachAction(action, btn) {
    const statusEl = $('outreach-run-status');
    const original = btn.textContent;
    btn.disabled = true;
    statusEl.textContent = 'Running…';
    try {
      const data = await api('admin-outreach-run', { method: 'POST', body: JSON.stringify({ action }) });
      if (action === 'discover') {
        statusEl.textContent = `Found ${data.createdCount} new (${data.skipped} already known).`;
      } else if (action === 'purge_em_dashes') {
        statusEl.textContent = `Cleaned ${data.succeeded}/${data.affectedCount} draft(s) with em-dashes.`;
      } else {
        statusEl.textContent = `Processed ${data.processed}, ${data.succeeded} succeeded, ${data.remaining} left.`;
      }
      if (data.errors && data.errors.length) statusEl.textContent += ` (${data.errors.length} error(s), see console)`;
      if (data.errors && data.errors.length) console.warn('[outreach]', data.errors);
      await new Promise(r => setTimeout(r, 2000)); // let Blobs settle before refreshing (brief read-after-write lag)
      await loadCommunities();
      await loadDrafts();
    } catch (e) {
      statusEl.textContent = `Failed: ${e.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  $('outreach-run-discover').addEventListener('click', (e) => runOutreachAction('discover', e.target));
  $('outreach-run-analyze').addEventListener('click', (e) => runOutreachAction('analyze', e.target));
  $('outreach-run-draft').addEventListener('click', (e) => runOutreachAction('draft', e.target));
  $('outreach-purge-emdashes').addEventListener('click', (e) => runOutreachAction('purge_em_dashes', e.target));

  async function loadCommunities() {
    const [communitiesData, draftsData] = await Promise.all([
      api('admin-outreach-communities'),
      api('admin-outreach-drafts'),
    ]);
    communitiesCache = communitiesData.communities || [];
    draftsCache = draftsData.drafts || [];
    renderCommunities();
  }

  function promoBadge(v) {
    const map = { yes: 'promo-yes', conditional: 'promo-conditional', no: 'promo-no', unknown: 'promo-unknown' };
    return `<span class="badge ${map[v] || 'promo-unknown'}">${esc(v || 'unknown')}</span>`;
  }

  function activityBadge(c) {
    if (c.hasActivityToday === true) return '<span class="badge activity-today">active today</span>';
    if (c.mostRecentActivityDate) return `<span class="badge activity-stale" title="${escAttr(c.activityRecencySummary || '')}">${esc(c.mostRecentActivityDate)}</span>`;
    return '<span class="badge activity-unknown">unknown</span>';
  }

  // Adrian's quality bar: 5,000+ verified members. Reuses the promo-yes/no/unknown
  // badge colors (green/red/gray) rather than adding new CSS for the same meaning.
  function membersBadge(c) {
    if (typeof c.memberCount === 'number') {
      const ok = c.memberCount >= 5000;
      return `<span class="badge ${ok ? 'promo-yes' : 'promo-no'}" title="${escAttr(c.memberCountSummary || '')}">${c.memberCount.toLocaleString()}</span>`;
    }
    return '<span class="badge promo-unknown">unknown</span>';
  }

  // A community's own `status` (discovered/needs_review/vetted_allowlisted/
  // rejected) tracks VETTING, not posting - a vetted community stays vetted
  // across many posts over time (4-day cooldown rotation), so it deliberately
  // never flips to anything like "posted". This renders a separate indicator
  // pulled from that community's draft so the main list actually shows when
  // a post has gone out, without repurposing the vetting field.
  function postedBadge(c) {
    const d = draftsCache.find(x => x.communityId === c.id);
    if (d && d.status === 'posted') {
      return `<span class="badge posted" title="${escAttr(d.postedAt || '')}">posted${d.postedAt ? ' ' + esc(fmtDate(d.postedAt)) : ''}</span>`;
    }
    return '<span style="color:var(--muted)">-</span>';
  }

  function renderCommunities() {
    const f = $('community-status-filter').value;
    const rows = communitiesCache.filter(c => !f || c.status === f);
    $('communities-body').innerHTML = rows.map(c => `
      <tr>
        <td><a href="${escAttr(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a></td>
        <td>${esc(c.platformType)}</td>
        <td><span class="badge ${c.status}">${esc(c.status.replace('_',' '))}</span></td>
        <td>${promoBadge(c.allowsSelfPromotion)}</td>
        <td>${membersBadge(c)}</td>
        <td>${activityBadge(c)}</td>
        <td>${postedBadge(c)}</td>
        <td style="max-width:320px;font-size:11px;color:var(--muted)">${esc((c.rulesSummary || '').slice(0, 140))}</td>
        <td>
          <button type="button" class="btn secondary" data-open-community="${c.id}">Open</button>
          <button type="button" class="btn danger" data-delete-community="${c.id}">Delete</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="9">No communities yet, run discovery.</td></tr>';

    $('communities-body').querySelectorAll('[data-open-community]').forEach(btn => {
      btn.addEventListener('click', () => openCommunity(btn.dataset.openCommunity));
    });
    $('communities-body').querySelectorAll('[data-delete-community]').forEach(btn => {
      btn.addEventListener('click', () => deleteCommunityFlow(btn.dataset.deleteCommunity, btn));
    });
  }

  // Deletes a community outright (e.g. a dead/defunct forum). Cascades server-
  // side to any draft for it too, so nothing orphaned lingers in the Drafts tab.
  async function deleteCommunityFlow(id, btn) {
    const c = communitiesCache.find(x => x.id === id);
    const name = c ? c.name : id;
    if (!confirm(`Delete "${name}" permanently? This also deletes its draft, if any. Past post-log entries are kept.`)) return;
    try {
      await runWithFeedback(btn, async () => {
        await api(`admin-outreach-communities?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        await settle();
      }, { busyText: 'Deleting...' });
    } catch (e) { return; }
    if (!$('community-detail').classList.contains('hidden') && $('community-detail').dataset.communityId === id) {
      $('community-detail').classList.add('hidden');
    }
    await loadCommunities();
  }

  $('refresh-communities').addEventListener('click', loadCommunities);
  $('community-status-filter').addEventListener('change', renderCommunities);

  // Shared renderer for a draft's action row + body text + flags, used both by
  // the Drafts tab's own detail panel and embedded inside a Community's detail
  // panel (so opening a community shows the whole workflow: vet -> draft -> post).
  function draftBlockHtml(d, community) {
    return `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px">
        <div><span class="badge ${d.status}">${esc(d.status.replace('_',' '))}</span></div>
        <div>
          ${d.status !== 'posted' && community ? `<button type="button" class="btn secondary" data-action="goto">Go to forum ↗</button>` : ''}
          <button type="button" class="btn secondary" data-action="status" data-value="approved">Approve</button>
          <button type="button" class="btn secondary" data-action="status" data-value="pending_review">Un-approve</button>
          <button type="button" class="btn secondary" data-action="status" data-value="rejected">Reject</button>
          ${(d.status === 'approved' && community && community.status === 'vetted_allowlisted') ? `<button type="button" class="btn" data-action="post-now">Post Now (Automatically)</button>` : ''}
          <button type="button" class="btn secondary" data-action="mark-posted">Mark posted</button>
          <button type="button" class="btn secondary" data-action="copy">Copy text</button>
        </div>
      </div>
      ${(d.status === 'approved' && community && community.status !== 'vetted_allowlisted') ? `<p style="font-size:11px;color:var(--warn)">"Post Now" is hidden until this community is Allow-listed above.</p>` : ''}
      ${(d.status !== 'approved' && community && community.status === 'vetted_allowlisted') ? `<p style="font-size:11px;color:var(--warn)">"Post Now" is hidden until this draft is Approved.</p>` : ''}
      <p style="font-size:11px;color:var(--muted)">Target: ${esc(d.targetContext)} · ${esc(d.adaptationReasoning || '')}</p>
      <p class="post-now-status" data-post-now-status="${d.id}" style="font-size:11px;color:var(--accent);display:none"></p>
      ${d.status === 'posted' ? `
        <p style="font-size:11px;color:var(--accent)">
          ${d.postUrl ? `<a href="${escAttr(d.postUrl)}" target="_blank" rel="noopener">View post ↗</a>` : 'Posted (no post link recorded).'}
          ${d.postedAsUsername ? ` · Posted as: ${esc(d.postedAsUsername)}` : ''}
        </p>` : ''}
      <div class="draft-text">${esc(d.draftText)}</div>
      ${(d.complianceFlags && d.complianceFlags.length) ? `<div class="flag-list">Flags: ${esc(d.complianceFlags.join('; '))}</div>` : ''}
      ${d.rejectionNote ? `<p style="font-size:11px;color:var(--danger)">Note: ${esc(d.rejectionNote)}</p>` : ''}
      ${(d.autoPostFailureCount > 0) ? `<p style="font-size:11px;color:var(--muted)">Auto-post attempts failed: ${d.autoPostFailureCount}</p>` : ''}
    `;
  }

  function wireDraftBlock(scopeEl, d, community, onChanged) {
    const gotoBtn = scopeEl.querySelector('[data-action="goto"]');
    if (gotoBtn && community) gotoBtn.addEventListener('click', () => window.open(community.url, '_blank', 'noopener'));

    scopeEl.querySelectorAll('[data-action="status"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await runWithFeedback(btn, async () => {
            await api(`admin-outreach-drafts?id=${encodeURIComponent(d.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: btn.dataset.value }),
            });
            await settle();
          }, { busyText: 'Saving...' });
        } catch (e) { return; }
        await onChanged();
        renderCommunities(); // refresh the main Communities list's Posted indicator too
      });
    });

    const markPostedBtn = scopeEl.querySelector('[data-action="mark-posted"]');
    if (markPostedBtn) {
      markPostedBtn.addEventListener('click', async () => {
        const postUrl = prompt('Link to the actual post (URL), leave blank if not available:', '');
        if (postUrl === null) return; // cancelled
        const postedAsUsername = prompt('Posted as which username/account?', '');
        if (postedAsUsername === null) return; // cancelled
        try {
          await runWithFeedback(markPostedBtn, async () => {
            await api(`admin-outreach-drafts?id=${encodeURIComponent(d.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'posted', postUrl: postUrl || null, postedAsUsername: postedAsUsername || null }),
            });
            await settle();
          }, { busyText: 'Saving...' });
        } catch (e) { return; }
        await onChanged();
        renderCommunities(); // refresh the main Communities list's Posted indicator too
        loadPostlog();
      });
    }
    const copyBtn = scopeEl.querySelector('[data-action="copy"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(d.draftText || '');
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy text'; }, 1500);
      });
    }

    // Post Now: hands off to the outreach agent, which does the real browser
    // automation. This function just triggers it and reflects the result -
    // watch the live "OUTREACH AGENT" widget (top-right) for real-time progress.
    const postNowBtn = scopeEl.querySelector('[data-action="post-now"]');
    if (postNowBtn) {
      postNowBtn.addEventListener('click', async () => {
        const statusEl = scopeEl.querySelector(`[data-post-now-status="${d.id}"]`);
        const showStatus = (msg, isError) => {
          if (!statusEl) return;
          statusEl.style.display = 'block';
          statusEl.style.color = isError ? 'var(--danger)' : 'var(--accent)';
          statusEl.textContent = msg;
        };
        if (!confirm(`Post this now to ${community ? community.name : 'this community'}? This is a real, live action.`)) return;
        postNowBtn.disabled = true;
        postNowBtn.textContent = 'Posting...';
        showStatus('Triggering the outreach agent, watch the live log above for progress...');
        try {
          const res = await api('admin-outreach-post-now', {
            method: 'POST',
            body: JSON.stringify({ draftId: d.id }),
          });
          showStatus(res.message || 'Triggered. Watch the live agent log for progress.');
        } catch (e) {
          showStatus(e.message || 'Failed to trigger. See console.', true);
        } finally {
          postNowBtn.disabled = false;
          postNowBtn.textContent = 'Post Now (Automatically)';
        }
      });
    }
  }

  async function openCommunity(id) {
    // Refresh drafts too so the embedded workflow section below always reflects
    // the latest state (e.g. right after a batch draft run or a manual generate).
    await loadDrafts();
    const c = communitiesCache.find(x => x.id === id);
    if (!c) return;
    const draft = draftsCache.find(x => x.communityId === id);
    const el = $('community-detail');
    el.classList.remove('hidden');
    el.dataset.communityId = id;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
        <div><strong>${esc(c.name)}</strong> · ${esc(c.platformType)} · <span class="badge ${c.status}">${esc(c.status.replace('_',' '))}</span></div>
        <div>
          <button type="button" class="btn secondary" data-vet="vetted_allowlisted">Allow-list</button>
          <button type="button" class="btn secondary" data-vet="needs_review">Needs review</button>
          <button type="button" class="btn secondary" data-vet="rejected">Reject</button>
          <button type="button" class="btn danger" id="community-delete-btn">Delete</button>
        </div>
      </div>
      <p style="font-size:11px;color:var(--muted)"><a href="${escAttr(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a></p>
      ${c.rulesSummary
        ? `<p style="font-size:12px">${esc(c.rulesSummary)}</p>`
        : `<p style="font-size:12px;color:var(--warn)">Not analyzed yet - allow-listing before analysis skips the real self-promotion check.</p>
           <button type="button" class="btn secondary" id="community-analyze-now-btn">Analyze now</button>`}
      ${c.selfPromoNotes ? `<p style="font-size:11px;color:var(--muted)">Conditions: ${esc(c.selfPromoNotes)}</p>` : ''}
      ${c.activityNotes ? `<p style="font-size:11px;color:var(--muted)">Tone notes: ${esc(c.activityNotes)}</p>` : ''}
      <p style="font-size:11px;color:var(--muted)">Members: ${membersBadge(c)} · Activity: ${activityBadge(c)} ${esc(c.activityRecencySummary || '')}</p>
      ${c.qualityGateNote ? `<p style="font-size:11px;color:${c.meetsQualityBar === false ? 'var(--danger)' : 'var(--muted)'}">Quality bar (5k+ members, active): ${esc(c.qualityGateNote)}</p>` : ''}
      ${c.status === 'vetted_allowlisted' ? `
        <label style="font-size:11px;color:var(--muted);display:flex;gap:6px;align-items:center;margin-top:8px">
          <input type="checkbox" id="community-autopost-toggle" ${c.autoPostEnabled ? 'checked' : ''}> Auto-post enabled for this community
        </label>` : ''}
      <hr style="border-color:var(--line);margin:14px 0">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Draft & post workflow</div>
      <div id="community-draft-workflow">
        ${draft ? draftBlockHtml(draft, c) : `
          <p style="font-size:12px;color:var(--muted)">No draft yet for this community.</p>
          <button type="button" class="btn" id="community-generate-draft-btn">Generate draft now</button>
        `}
      </div>
    `;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const deleteBtn = $('community-delete-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', () => deleteCommunityFlow(id, deleteBtn));

    el.querySelectorAll('[data-vet]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await runWithFeedback(btn, async () => {
            await api(`admin-outreach-communities?id=${encodeURIComponent(id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: btn.dataset.vet }),
            });
            await settle();
          }, { busyText: 'Saving...' });
        } catch (e) { return; }
        await loadCommunities();
        openCommunity(id);
      });
    });
    const analyzeNowBtn = $('community-analyze-now-btn');
    if (analyzeNowBtn) {
      analyzeNowBtn.addEventListener('click', async () => {
        try {
          await runWithFeedback(analyzeNowBtn, async () => {
            await api('admin-outreach-run', { method: 'POST', body: JSON.stringify({ action: 'analyze_one', communityId: id }) });
            await settle(1500);
          }, { busyText: 'Analyzing...' });
        } catch (e) { return; }
        await loadCommunities();
        openCommunity(id);
      });
    }
    const autopostToggle = $('community-autopost-toggle');
    if (autopostToggle) {
      autopostToggle.addEventListener('change', async () => {
        // Always include status alongside autoPostEnabled here (this toggle only
        // renders when status is already vetted_allowlisted), avoids a race with
        // Blobs' brief read-after-write lag if this fires right after allow-listing.
        const desired = autopostToggle.checked;
        autopostToggle.disabled = true;
        try {
          await api(`admin-outreach-communities?id=${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'vetted_allowlisted', autoPostEnabled: desired }),
          });
          await settle(1000);
        } catch (e) {
          autopostToggle.checked = !desired;
          alert(`Failed to update auto-post setting: ${e.message || 'unknown error'}`);
        } finally {
          autopostToggle.disabled = false;
        }
        await loadCommunities();
      });
    }

    if (draft) {
      wireDraftBlock($('community-draft-workflow'), draft, c, async () => { await openCommunity(id); });
    } else {
      const genBtn = $('community-generate-draft-btn');
      if (genBtn) {
        genBtn.addEventListener('click', async () => {
          genBtn.disabled = true;
          genBtn.textContent = 'Generating…';
          try {
            await api('admin-outreach-run', { method: 'POST', body: JSON.stringify({ action: 'draft_one', communityId: id }) });
            await new Promise(r => setTimeout(r, 2000)); // let Blobs settle before refetching
            await openCommunity(id);
          } catch (e) {
            genBtn.disabled = false;
            genBtn.textContent = 'Generate draft now';
            alert(`Failed to generate draft: ${e.message}`);
          }
        });
      }
    }
  }

  async function loadDrafts() {
    const data = await api('admin-outreach-drafts');
    draftsCache = data.drafts || [];
    renderDrafts();
  }

  function renderDrafts() {
    const f = $('draft-status-filter').value;
    const rows = draftsCache.filter(d => !f || d.status === f);
    $('drafts-body').innerHTML = rows.map(d => {
      const community = communitiesCache.find(c => c.id === d.communityId);
      return `
      <tr>
        <td>${esc(community ? community.name : d.communityId)}</td>
        <td><span class="badge ${d.status}">${esc(d.status.replace('_',' '))}</span></td>
        <td>${d.complianceCheckPassed ? '<span class="badge vetted_allowlisted">clean</span>' : '<span class="badge rejected">flagged</span>'}</td>
        <td>${fmtDate(d.createdAt)}</td>
        <td><button type="button" class="btn secondary" data-open-draft="${d.id}">Open</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5">No drafts yet.</td></tr>';

    $('drafts-body').querySelectorAll('[data-open-draft]').forEach(btn => {
      btn.addEventListener('click', () => openDraft(btn.dataset.openDraft));
    });
  }

  $('refresh-drafts').addEventListener('click', loadDrafts);
  $('draft-status-filter').addEventListener('change', renderDrafts);

  function openDraft(id) {
    const d = draftsCache.find(x => x.id === id);
    if (!d) return;
    const community = communitiesCache.find(c => c.id === d.communityId);
    const el = $('draft-detail');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div style="margin-bottom:6px"><strong>${esc(community ? community.name : d.communityId)}</strong></div>
      ${draftBlockHtml(d, community)}
    `;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    wireDraftBlock(el, d, community, async () => { await loadDrafts(); openDraft(id); });
  }

  async function loadPostlog() {
    const data = await api('admin-outreach-postlog');
    const entries = data.entries || [];
    $('postlog-body').innerHTML = entries.map(p => {
      const community = communitiesCache.find(c => c.id === p.communityId);
      return `
      <tr>
        <td>${esc(community ? community.name : p.communityId)}</td>
        <td>${esc(p.method)}</td>
        <td>${fmtDate(p.postedAt)}</td>
        <td style="font-size:11px;color:var(--muted)">${esc(p.outcome || '-')}${p.postedAsUsername ? ` · as ${esc(p.postedAsUsername)}` : ''}</td>
        <td>${p.postUrl ? `<a href="${escAttr(p.postUrl)}" target="_blank" rel="noopener">View ↗</a>` : '-'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="5">No posts logged yet.</td></tr>';
  }

  $('refresh-postlog').addEventListener('click', loadPostlog);

  // ---- Analytics ----
  // Self-hosted, no third-party tracker: reads whatever public/analytics-track.js
  // has recorded via /api/track-event, aggregated server-side by
  // admin-analytics-summary. Chart is hand-drawn on canvas (no CDN dependency).

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }

  function drawAnalyticsChart(daily) {
    const canvas = $('analytics-chart');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    const cssHeight = 110;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (!daily.length) {
      ctx.fillStyle = cssVar('--muted');
      ctx.font = '11px monospace';
      ctx.fillText('No data in this range yet.', 10, cssHeight / 2);
      return;
    }

    const padL = 30, padR = 6, padT = 6, padB = 16;
    const chartW = cssWidth - padL - padR;
    const chartH = cssHeight - padT - padB;
    const maxVal = Math.max(1, ...daily.map(d => Math.max(d.pageviews, d.downloads)));
    const barGroupW = chartW / daily.length;
    const barW = Math.max(2, Math.min(14, barGroupW * 0.32));

    ctx.strokeStyle = cssVar('--line');
    ctx.fillStyle = cssVar('--muted');
    ctx.font = '9px monospace';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      const y = padT + chartH - (chartH * i / 2);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
      const val = Math.round(maxVal * i / 2);
      ctx.fillText(String(val), 2, y + 3);
    }

    const accent = cssVar('--accent');
    const danger = cssVar('--danger');
    const showEveryLabel = daily.length <= 10;

    daily.forEach((d, i) => {
      const groupX = padL + i * barGroupW + barGroupW / 2;
      const pvH = (d.pageviews / maxVal) * chartH;
      const dlH = (d.downloads / maxVal) * chartH;

      ctx.fillStyle = accent;
      ctx.fillRect(groupX - barW - 1, padT + chartH - pvH, barW, pvH);

      ctx.fillStyle = danger;
      ctx.fillRect(groupX + 1, padT + chartH - dlH, barW, dlH);

      if (showEveryLabel || i === 0 || i === daily.length - 1 || i % Math.ceil(daily.length / 6) === 0) {
        ctx.fillStyle = cssVar('--muted');
        ctx.font = '8px monospace';
        const label = d.date.slice(5);
        ctx.fillText(label, groupX - 10, cssHeight - 3);
      }
    });
  }

  function fmtSeconds(sec) {
    if (!sec) return '0s';
    if (sec < 60) return `${Math.round(sec)}s`;
    const m = Math.floor(sec / 60);
    const s2 = Math.round(sec % 60);
    return `${m}m ${s2}s`;
  }

  async function loadAnalytics() {
    const range = $('analytics-range').value;
    const startInput = $('analytics-start');
    const endInput = $('analytics-end');
    const isCustom = range === 'custom';
    startInput.classList.toggle('hidden', !isCustom);
    endInput.classList.toggle('hidden', !isCustom);

    let qs = `range=${encodeURIComponent(range)}`;
    if (isCustom) {
      if (!startInput.value || !endInput.value) return;
      qs += `&start=${encodeURIComponent(startInput.value)}&end=${encodeURIComponent(endInput.value)}`;
    }

    let data;
    try {
      data = await api(`admin-analytics-summary?${qs}`);
    } catch (err) {
      $('analytics-stats-grid').innerHTML = `<div class="stat"><div class="stat-l" style="color:var(--danger)">Failed to load analytics: ${esc(err.message || 'unknown error')}</div></div>`;
      return;
    }

    const t = data.totals || {};
    const totalNewRet = (t.newVisitors || 0) + (t.returningVisitors || 0);
    const returningPct = totalNewRet > 0 ? Math.round((t.returningVisitors / totalNewRet) * 100) : 0;
    $('analytics-stats-grid').innerHTML = `
      <div class="stat"><div class="stat-n">${t.pageviews || 0}</div><div class="stat-l">PAGEVIEWS</div></div>
      <div class="stat"><div class="stat-n">${t.uniqueVisitors || 0}</div><div class="stat-l">UNIQUE VISITORS</div></div>
      <div class="stat"><div class="stat-n">${t.downloads || 0}</div><div class="stat-l">DOWNLOADS</div></div>
      <div class="stat"><div class="stat-n">${fmtSeconds(t.avgSessionDurationSec)}</div><div class="stat-l">AVG TIME ON SITE</div></div>
      <div class="stat"><div class="stat-n">${t.avgPagesPerSession || 0}</div><div class="stat-l">PAGES / SESSION</div></div>
      <div class="stat"><div class="stat-n">${returningPct}%</div><div class="stat-l">RETURNING VISITORS</div></div>
    `;

    drawAnalyticsChart(data.daily || []);

    const pages = (data.topPages || []).slice(0, 5);
    $('analytics-top-pages').innerHTML = pages.map(p => `
      <tr><td>${esc(p.path)}</td><td style="text-align:right;color:var(--muted)">${p.views}</td></tr>
    `).join('') || '<tr><td colspan="2">No pageviews yet.</td></tr>';

    const refs = (data.topReferrers || []).slice(0, 5);
    $('analytics-top-referrers').innerHTML = refs.map(r => `
      <tr><td>${esc(r.referrer)}</td><td style="text-align:right;color:var(--muted)">${r.visits}</td></tr>
    `).join('') || '<tr><td colspan="2">No referrer data yet.</td></tr>';

    const renderSmallTable = (elId, rows, labelKey, valueKey, emptyLabel) => {
      const el = $(elId);
      if (!el) return;
      const list = (rows || []).slice(0, 6);
      el.innerHTML = list.map(r => `
        <tr><td>${esc(String(r[labelKey] || 'Unknown'))}</td><td style="text-align:right;color:var(--muted)">${r[valueKey]}</td></tr>
      `).join('') || `<tr><td colspan="2">${emptyLabel}</td></tr>`;
    };

    renderSmallTable('analytics-top-devices', data.topDevices, 'device', 'views', 'No device data yet.');
    renderSmallTable('analytics-top-browsers', data.topBrowsers, 'browser', 'views', 'No browser data yet.');
    renderSmallTable('analytics-top-os', data.topOS, 'os', 'views', 'No OS data yet.');
    renderSmallTable('analytics-top-countries', data.topCountries, 'country', 'views', 'No country data available.');
    renderSmallTable('analytics-top-utm-sources', data.topUtmSources, 'source', 'views', 'No campaign traffic yet.');
    renderSmallTable('analytics-top-utm-campaigns', data.topUtmCampaigns, 'campaign', 'views', 'No campaign traffic yet.');
    renderSmallTable('analytics-top-outreach-referrals', data.topOutreachReferrals, 'community', 'clicks', 'No outreach link clicks yet.');
  }

  $('analytics-range').addEventListener('change', loadAnalytics);
  $('analytics-start').addEventListener('change', loadAnalytics);
  $('analytics-end').addEventListener('change', loadAnalytics);
  $('analytics-refresh').addEventListener('click', loadAnalytics);
  window.addEventListener('resize', () => {
    if ($('panel-analytics') && $('panel-analytics').classList.contains('active')) loadAnalytics();
  });
  let analyticsAutoRefreshTimer = null;
  function analyticsMaybeAutoRefresh() {
    if ($('panel-analytics') && $('panel-analytics').classList.contains('active')) loadAnalytics();
  }
  analyticsAutoRefreshTimer = setInterval(analyticsMaybeAutoRefresh, 10000);


  if (token) {
    api('admin-dashboard').then(showApp).catch(logout);
  }
})();
