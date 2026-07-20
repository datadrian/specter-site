// tunnel-provision.js — hands a licensed SPECTER install a stable subdomain
// under specter-imaging.com plus a cloudflared connector token, so INTERNET
// mode gives a permanent trusted-HTTPS URL with ZERO user setup.
//
// Flow per machine:
//   1. Validate the license (must be a real, activated key bound to this machine).
//   2. Derive a stable subdomain from the machine id: m-<20hex>.remote....
//   3. Create-or-reuse a Cloudflare "remotely-managed" tunnel for this machine.
//   4. Set the tunnel config so the hostname routes to http://127.0.0.1:<port>.
//   5. Ensure a DNS CNAME hostname -> <tunnelId>.cfargotunnel.com (proxied).
//   6. Return { token, hostname } for `cloudflared tunnel run --token`.
//
// Required env (Netlify): CF_API_TOKEN (Account: Cloudflare Tunnel Edit +
// Zone: DNS Edit), CF_ACCOUNT_ID, CF_ZONE_ID, TUNNEL_ROOT (e.g.
// remote.specter-imaging.com), LICENSE_SALT (existing).
const { json, corsPreflight, readJson } = require('./_lib/http');
const { validateKey } = require('./_lib/license-key');
const { configureStore, getRecord } = require('./_lib/license-store');

const CF_API = 'https://api.cloudflare.com/client/v4';

async function cf(path, opts = {}) {
  const res = await fetch(`${CF_API}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${process.env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = (data.errors && data.errors[0] && data.errors[0].message) || `CF ${res.status}`;
    const err = new Error(msg);
    err.cf = data;
    throw err;
  }
  return data.result;
}

// Deterministic, DNS-safe tunnel/subdomain name for a machine.
function names(machineId) {
  const slug = String(machineId).toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 20) || 'anon';
  const sub = `m-${slug}`;
  // NOTE: keep the hostname at the 3rd level (m-xxx.specter-imaging.com) so the
  // FREE Cloudflare universal wildcard cert (*.specter-imaging.com) covers it.
  // A 4th level (m-xxx.remote.specter-imaging.com) would need paid Advanced
  // Certificate Manager and would throw SSL errors on phones otherwise.
  const root = process.env.TUNNEL_ROOT || 'specter-imaging.com';
  // Node relay host lives at the SAME 3rd level so the free *.specter-imaging.com
  // wildcard cert covers it (n-xxx.specter-imaging.com). The ESP32 node connects
  // wss:// here; Cloudflare edge terminates TLS and forwards ws to the local node
  // WS server (:47846). This is ADDITIVE to the phone-viewer hostname (m-xxx).
  const nodeSub = `n-${slug}`;
  return { tunnelName: `specter-${sub}`, hostname: `${sub}.${root}`, nodeHostname: `${nodeSub}.${root}` };
}

// Find an existing remotely-managed tunnel by name (not deleted), else create.
async function ensureTunnel(accountId, tunnelName) {
  const list = await cf(`/accounts/${accountId}/cfd_tunnel?name=${encodeURIComponent(tunnelName)}&is_deleted=false`);
  if (Array.isArray(list) && list.length) {
    // Reuse — fetch its token below.
    return list[0];
  }
  // config_src 'cloudflare' = remotely-managed (config/ingress set via API).
  return cf(`/accounts/${accountId}/cfd_tunnel`, {
    method: 'POST',
    body: JSON.stringify({ name: tunnelName, config_src: 'cloudflare' }),
  });
}

async function getTunnelToken(accountId, tunnelId) {
  // Returns the base64 connector token string.
  return cf(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`);
}

async function setTunnelConfig(accountId, tunnelId, hostname, port, nodeHostname) {
  // ORDER MATTERS: the phone-viewer HTTP host stays the FIRST rule (unchanged).
  // The node WS host is appended as a SECOND rule; the 404 catch-all stays last.
  // The node WS server is fixed at 47846 (NODE_WS_PORT), independent of the
  // remote-server HTTP port so the phone viewer is never affected.
  const NODE_WS_PORT = 47846;
  const ingress = [
    { hostname, service: `http://127.0.0.1:${port}` },
  ];
  if (nodeHostname) {
    ingress.push({ hostname: nodeHostname, service: `http://127.0.0.1:${NODE_WS_PORT}` });
  }
  ingress.push({ service: 'http_status:404' });
  return cf(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
    method: 'PUT',
    body: JSON.stringify({ config: { ingress } }),
  });
}

async function ensureDns(zoneId, hostname, tunnelId) {
  const target = `${tunnelId}.cfargotunnel.com`;
  const existing = await cf(`/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`);
  if (Array.isArray(existing) && existing.length) {
    const rec = existing[0];
    if (rec.content !== target || rec.proxied !== true) {
      await cf(`/zones/${zoneId}/dns_records/${rec.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ type: 'CNAME', name: hostname, content: target, proxied: true }),
      });
    }
    return;
  }
  await cf(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({ type: 'CNAME', name: hostname, content: target, proxied: true, ttl: 1 }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  for (const v of ['CF_API_TOKEN', 'CF_ACCOUNT_ID', 'CF_ZONE_ID']) {
    if (!process.env[v]) return json(500, { error: `Server not configured (${v} missing).` });
  }

  configureStore(event);
  const body = readJson(event);
  const licenseKey = String(body.licenseKey || '').trim().toUpperCase();
  const machineId = String(body.machineId || '').trim();
  const port = Number(body.port) || 47842;

  if (!machineId) return json(400, { error: 'machineId required' });

  // Gate on a valid, activated license bound to THIS machine.
  const fmt = validateKey(licenseKey, process.env.LICENSE_SALT);
  if (!fmt.ok) return json(403, { error: 'A valid license is required for internet mode.' });
  const record = await getRecord(fmt.key);
  if (!record) return json(403, { error: 'License not found.' });
  if (record.machineId && record.machineId !== machineId) {
    return json(403, { error: 'License is activated on a different computer.' });
  }

  const accountId = process.env.CF_ACCOUNT_ID;
  const zoneId = process.env.CF_ZONE_ID;
  const { tunnelName, hostname, nodeHostname } = names(machineId);

  try {
    const tunnel = await ensureTunnel(accountId, tunnelName);
    const tunnelId = tunnel.id;
    await setTunnelConfig(accountId, tunnelId, hostname, port, nodeHostname);
    await ensureDns(zoneId, hostname, tunnelId);
    await ensureDns(zoneId, nodeHostname, tunnelId);
    // A freshly-created tunnel returns its connector token inline; an existing
    // one does not, so fetch it from the /token endpoint in that case.
    const token = tunnel.token || await getTunnelToken(accountId, tunnelId);
    return json(200, { hostname, nodeHostname, token });
  } catch (e) {
    return json(502, { error: 'Provisioning failed: ' + (e && e.message ? e.message : 'unknown') });
  }
};
