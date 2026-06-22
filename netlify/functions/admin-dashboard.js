const { json, corsPreflight } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, getStats } = require('./_lib/license-store');
const { listTickets } = require('./_lib/ticket-store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);

  const [licenseStats, tickets] = await Promise.all([getStats(), listTickets()]);
  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'waiting').length;

  return json(200, {
    ok: true,
    licenses: licenseStats,
    tickets: {
      total: tickets.length,
      open: openTickets,
      closed: tickets.filter(t => t.status === 'closed').length,
    },
  });
};
