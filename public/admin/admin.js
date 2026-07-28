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
      // quiet failure — this widget shouldn't interrupt the rest of the console
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
      <div class="stat"><div class="stat-n">${s.comp}</div><div class="stat-l">COMP KEYS</div></div>
      <div class="stat"><div class="stat-n">${s.replacement || 0}</div><div class="stat-l">REPLACEMENTS</div></div>
      <div class="stat"><div class="stat-n">${t.open}</div><div class="stat-l">OPEN TICKETS</div></div>
      <div class="stat"><div class="stat-n">${t.total}</div><div class="stat-l">ALL TICKETS</div></div>
      <div class="stat"><div class="stat-n">${o.needsReview || 0}</div><div class="stat-l">COMMUNITIES TO VET</div></div>
      <div class="stat"><div class="stat-n">${o.pendingDrafts || 0}</div><div class="stat-l">DRAFTS TO REVIEW</div></div>
      <div class="stat"><div class="stat-n">${o.allowlisted || 0}</div><div class="stat-l">ALLOW-LISTED</div></div>
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
      !q || (r.email || '').toLowerCase().includes(q) || (r.key || '').toLowerCase().includes(q)
    );
    $('licenses-body').innerHTML = rows.map(r => `
      <tr>
        <td><code>${r.key}</code></td>
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
    `).join('') || '<tr><td colspan="8">No licenses yet</td></tr>';

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
      }),
    });
    const box = $('mint-result');
    box.classList.remove('hidden');
    box.innerHTML = `<strong>Key:</strong> <code>${data.license.key}</code><br>
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
      box.innerHTML = `<strong>Replacement key:</strong> <code>${data.license.key}</code><br>
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
    const data = await api('admin-outreach-communities');
    communitiesCache = data.communities || [];
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

  function renderCommunities() {
    const f = $('community-status-filter').value;
    const rows = communitiesCache.filter(c => !f || c.status === f);
    $('communities-body').innerHTML = rows.map(c => `
      <tr>
        <td><a href="${escAttr(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a></td>
        <td>${esc(c.platformType)}</td>
        <td><span class="badge ${c.status}">${esc(c.status.replace('_',' '))}</span></td>
        <td>${promoBadge(c.allowsSelfPromotion)}</td>
        <td>${activityBadge(c)}</td>
        <td style="max-width:320px;font-size:11px;color:var(--muted)">${esc((c.rulesSummary || '').slice(0, 140))}</td>
        <td><button type="button" class="btn secondary" data-open-community="${c.id}">Open</button></td>
      </tr>
    `).join('') || '<tr><td colspan="7">No communities yet — run discovery.</td></tr>';

    $('communities-body').querySelectorAll('[data-open-community]').forEach(btn => {
      btn.addEventListener('click', () => openCommunity(btn.dataset.openCommunity));
    });
  }

  $('refresh-communities').addEventListener('click', loadCommunities);
  $('community-status-filter').addEventListener('change', renderCommunities);

  function openCommunity(id) {
    const c = communitiesCache.find(x => x.id === id);
    if (!c) return;
    const el = $('community-detail');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
        <div><strong>${esc(c.name)}</strong> · ${esc(c.platformType)} · <span class="badge ${c.status}">${esc(c.status.replace('_',' '))}</span></div>
        <div>
          <button type="button" class="btn secondary" data-vet="vetted_allowlisted">Allow-list</button>
          <button type="button" class="btn secondary" data-vet="needs_review">Needs review</button>
          <button type="button" class="btn secondary" data-vet="rejected">Reject</button>
        </div>
      </div>
      <p style="font-size:11px;color:var(--muted)"><a href="${escAttr(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a></p>
      <p style="font-size:12px">${esc(c.rulesSummary || 'Not analyzed yet.')}</p>
      ${c.selfPromoNotes ? `<p style="font-size:11px;color:var(--muted)">Conditions: ${esc(c.selfPromoNotes)}</p>` : ''}
      ${c.activityNotes ? `<p style="font-size:11px;color:var(--muted)">Tone notes: ${esc(c.activityNotes)}</p>` : ''}
      <p style="font-size:11px;color:var(--muted)">Activity: ${activityBadge(c)} ${esc(c.activityRecencySummary || '')}</p>
      ${c.status === 'vetted_allowlisted' ? `
        <label style="font-size:11px;color:var(--muted);display:flex;gap:6px;align-items:center;margin-top:8px">
          <input type="checkbox" id="community-autopost-toggle" ${c.autoPostEnabled ? 'checked' : ''}> Auto-post enabled for this community
        </label>` : ''}
    `;

    el.querySelectorAll('[data-vet]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api(`admin-outreach-communities?id=${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: btn.dataset.vet }),
        });
        await loadCommunities();
        openCommunity(id);
      });
    });
    const autopostToggle = $('community-autopost-toggle');
    if (autopostToggle) {
      autopostToggle.addEventListener('change', async () => {
        // Always include status alongside autoPostEnabled here (this toggle only
        // renders when status is already vetted_allowlisted) — avoids a race with
        // Blobs' brief read-after-write lag if this fires right after allow-listing.
        await api(`admin-outreach-communities?id=${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'vetted_allowlisted', autoPostEnabled: autopostToggle.checked }),
        });
        await loadCommunities();
      });
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
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px">
        <div><strong>${esc(community ? community.name : d.communityId)}</strong> · <span class="badge ${d.status}">${esc(d.status.replace('_',' '))}</span></div>
        <div>
          ${d.status !== 'posted' && community ? `<button type="button" class="btn secondary" id="goto-forum-btn">Go to forum ↗</button>` : ''}
          <button type="button" class="btn secondary" data-draft-status="approved">Approve</button>
          <button type="button" class="btn secondary" data-draft-status="pending_review">Un-approve</button>
          <button type="button" class="btn secondary" data-draft-status="rejected">Reject</button>
          <button type="button" class="btn secondary" id="mark-posted-btn">Mark posted</button>
          <button type="button" class="btn secondary" id="copy-draft-btn">Copy text</button>
        </div>
      </div>
      <p style="font-size:11px;color:var(--muted)">Target: ${esc(d.targetContext)} · ${esc(d.adaptationReasoning || '')}</p>
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

    const gotoBtn = $('goto-forum-btn');
    if (gotoBtn && community) {
      gotoBtn.addEventListener('click', () => window.open(community.url, '_blank', 'noopener'));
    }

    el.querySelectorAll('[data-draft-status]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api(`admin-outreach-drafts?id=${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: btn.dataset.draftStatus }),
        });
        await loadDrafts();
        openDraft(id);
      });
    });

    const markPostedBtn = $('mark-posted-btn');
    if (markPostedBtn) {
      markPostedBtn.addEventListener('click', async () => {
        const postUrl = prompt('Link to the actual post (URL) — leave blank if not available:', '');
        if (postUrl === null) return; // cancelled
        const postedAsUsername = prompt('Posted as which username/account?', '');
        if (postedAsUsername === null) return; // cancelled
        await api(`admin-outreach-drafts?id=${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'posted', postUrl: postUrl || null, postedAsUsername: postedAsUsername || null }),
        });
        await loadDrafts();
        openDraft(id);
        loadPostlog();
      });
    }
    const copyBtn = $('copy-draft-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(d.draftText || '');
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy text'; }, 1500);
      });
    }
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


  if (token) {
    api('admin-dashboard').then(showApp).catch(logout);
  }
})();
