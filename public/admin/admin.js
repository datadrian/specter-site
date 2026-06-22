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
  }

  function showApp() {
    $('login-view').classList.add('hidden');
    $('app-view').classList.remove('hidden');
    activatePanel(initialPanel());
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
    $('stats-grid').innerHTML = `
      <div class="stat"><div class="stat-n">${s.total}</div><div class="stat-l">TOTAL KEYS</div></div>
      <div class="stat"><div class="stat-n">${s.activated}</div><div class="stat-l">ACTIVATED</div></div>
      <div class="stat"><div class="stat-n">${s.unactivated}</div><div class="stat-l">UNACTIVATED</div></div>
      <div class="stat"><div class="stat-n">${s.comp}</div><div class="stat-l">COMP KEYS</div></div>
      <div class="stat"><div class="stat-n">${s.replacement || 0}</div><div class="stat-l">REPLACEMENTS</div></div>
      <div class="stat"><div class="stat-n">${t.open}</div><div class="stat-l">OPEN TICKETS</div></div>
      <div class="stat"><div class="stat-n">${t.total}</div><div class="stat-l">ALL TICKETS</div></div>
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
        <td>${esc(r.email || '—')}</td>
        <td>${r.machineId || '—'}</td>
        <td>${fmtDate(r.purchasedAt)}</td>
        <td>${r.activatedAt ? fmtDate(r.activatedAt) : '—'}</td>
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
      ${data.emailSent ? 'Emailed to recipient.' : 'Copy the key — no email sent.'}`;
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
        ${data.emailSent ? 'Emailed to purchaser.' : 'Copy the key — email was not sent.'}`;

      loadDashboard();
      loadLicenses();
    } catch (e) {
      box.classList.remove('hidden');
      box.innerHTML = esc(e.message || 'Could not issue replacement key.');
    }
  }

  function fmtDate(iso) {
    if (!iso) return '—';
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

  if (token) {
    api('admin-dashboard').then(showApp).catch(logout);
  }
})();
