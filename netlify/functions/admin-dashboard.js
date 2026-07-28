const { json, corsPreflight } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, getStats } = require('./_lib/license-store');
const { configureStore: configureTicketStore, listTickets } = require('./_lib/ticket-store');
const { configureStore: configureOutreachStore, listCommunities, listDrafts } = require('./_lib/outreach-store');
const { configureStore: configureAnalyticsStore, listEventsInRange } = require('./_lib/analytics-store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);
  configureTicketStore(event);
  configureOutreachStore(event);
  configureAnalyticsStore(event);

  const todayStr = new Date().toISOString().slice(0, 10);

  const [licenseStats, tickets, communities, drafts, todayEvents] = await Promise.all([
    getStats(),
    listTickets(),
    listCommunities(),
    listDrafts(),
    listEventsInRange(todayStr, todayStr),
  ]);
  
  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'waiting').length;
  
  const todayPageviews = todayEvents.filter(e => e.type === 'pageview').length;
  const todayDownloads = todayEvents.filter(e => e.type === 'download').length;

  return json(200, {
    ok: true,
    licenses: licenseStats,
    tickets: {
      total: tickets.length,
      open: openTickets,
      closed: tickets.filter(t => t.status === 'closed').length,
    },
    outreach: {
      totalCommunities: communities.length,
      needsReview: communities.filter(c => c.status === 'needs_review').length,
      allowlisted: communities.filter(c => c.status === 'vetted_allowlisted').length,
      pendingDrafts: drafts.filter(d => d.status === 'pending_review').length,
      approvedDrafts: drafts.filter(d => d.status === 'approved').length,
    },
    analytics: {
      todayPageviews,
      todayDownloads,
    },
  });
};
