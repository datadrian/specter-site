const { json, corsPreflight } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, listEventsInRange, getDatesInRange } = require('./_lib/analytics-store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  const query = event.queryStringParameters || {};
  const site = query.site || 'imaging';
  if (!['imaging', 'sdr'].includes(site)) return json(400, { error: 'Invalid analytics site' });
  const today = new Date().toISOString().slice(0,10);
  const range = query.range || '7d';
  const days = { today: 1, '7d': 7, '30d': 30, '90d': 90 };
  if (!(range in days) && range !== 'custom') return json(400, { error: 'Invalid date range' });
  let end = range === 'custom' ? (query.end || today) : today;
  let start = range === 'custom' ? (query.start || today) : new Date(Date.parse(today) - (days[range] - 1) * 86400000).toISOString().slice(0,10);
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  if (!validDate(start) || !validDate(end)) return json(400, { error: 'Invalid date' });
  if (start > end) [start, end] = [end, start];
  if ((Date.parse(end) - Date.parse(start)) / 86400000 >= 366) return json(400, { error: 'Choose no more than 366 days' });
  try {
    configureStore(event);
    const events = (await listEventsInRange(start, end)).filter(e => (e.site || 'imaging') === site);
    const dailyMap = Object.fromEntries(getDatesInRange(start,end).map(date => [date,{date,pageviews:0,downloads:0}]));
    const pages = new Map();
    const totals = { pageviews: 0, downloads: 0 };
    for (const e of events) {
      if (!['pageview','download'].includes(e.type)) continue;
      const day = String(e.ts || e.timestamp || '').slice(0,10);
      if (!dailyMap[day]) continue;
      const key = e.type === 'pageview' ? 'pageviews' : 'downloads';
      totals[key]++;dailyMap[day][key]++;
      if (e.type === 'pageview') pages.set(e.path || '/', (pages.get(e.path || '/') || 0) + 1);
    }
    return json(200, { ok: true, site, collectionMode: 'anonymous-counts', range:{start,end}, totals, daily:Object.values(dailyMap), topPages:[...pages].map(([path,views]) => ({path,views})).sort((a,b) => b.views-a.views).slice(0,10) });
  } catch (_) {
    console.error('[admin-analytics-summary] Counter summary unavailable');
    return json(500, { ok:false, error:'Unable to load usage counts' });
  }
};
