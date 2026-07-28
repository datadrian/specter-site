const { json, corsPreflight } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, listEventsInRange, getDatesInRange } = require('./_lib/analytics-store');

function getDaysAgo(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function getReferrerHost(ref) {
  if (!ref) return 'direct/none';
  const trimmed = ref.trim().toLowerCase();
  if (trimmed === 'direct' || trimmed === 'none' || trimmed === 'direct/none') {
    return 'direct/none';
  }
  try {
    const u = new URL(ref);
    let host = u.hostname;
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }
    // Check for same-origin or localhost
    if (host === 'specter-imaging.com' || host === 'localhost' || host.endsWith('.netlify.app')) {
      return 'direct/none';
    }
    return host || 'direct/none';
  } catch (_) {
    return 'direct/none';
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return corsPreflight();
  }
  
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }
  
  try {
    const auth = requireAdmin(event);
    if (!auth.authorized) {
      return auth.response;
    }
    
    configureStore(event);
    
    const range = event.queryStringParameters?.range || '7d';
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    
    let start = todayStr;
    let end = todayStr;
    
    if (range === '7d') {
      start = getDaysAgo(today, 6);
    } else if (range === '30d') {
      start = getDaysAgo(today, 29);
    } else if (range === '90d') {
      start = getDaysAgo(today, 89);
    } else if (range === 'custom') {
      start = event.queryStringParameters?.start || todayStr;
      end = event.queryStringParameters?.end || todayStr;
    }
    
    // Ensure start is before or equal to end
    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }
    
    const events = await listEventsInRange(start, end);
    const dates = getDatesInRange(start, end);
    
    // Calculate Totals
    let pageviews = 0;
    let downloads = 0;
    let totalDurationMs = 0;
    let durationCount = 0;
    const uniqueSessionsSet = new Set();
    
    const dailyMap = {};
    for (const d of dates) {
      dailyMap[d] = {
        date: d,
        pageviews: 0,
        uniqueSessionsSet: new Set(),
        downloads: 0
      };
    }
    
    const pageViewsMap = {};
    const referrersMap = {};
    
    for (const evt of events) {
      const ts = evt.ts || evt.timestamp || new Date().toISOString();
      const dateStr = ts.slice(0, 10);
      
      if (evt.sessionId) {
        uniqueSessionsSet.add(evt.sessionId);
        if (dailyMap[dateStr]) {
          dailyMap[dateStr].uniqueSessionsSet.add(evt.sessionId);
        }
      }
      
      if (evt.type === 'pageview') {
        pageviews++;
        if (dailyMap[dateStr]) {
          dailyMap[dateStr].pageviews++;
        }
        
        const path = evt.path || '/';
        pageViewsMap[path] = (pageViewsMap[path] || 0) + 1;
        
        const host = getReferrerHost(evt.referrer);
        referrersMap[host] = (referrersMap[host] || 0) + 1;
        
      } else if (evt.type === 'download') {
        downloads++;
        if (dailyMap[dateStr]) {
          dailyMap[dateStr].downloads++;
        }
      }
      
      if (evt.durationMs !== undefined && evt.durationMs !== null && !isNaN(evt.durationMs)) {
        totalDurationMs += Number(evt.durationMs);
        durationCount++;
      }
    }
    
    const avgSessionDurationSec = durationCount > 0 ? (totalDurationMs / durationCount) / 1000 : 0;
    
    const totals = {
      pageviews,
      uniqueSessions: uniqueSessionsSet.size,
      downloads,
      avgSessionDurationSec: Number(avgSessionDurationSec.toFixed(1)),
    };
    
    const daily = dates.map(d => {
      const entry = dailyMap[d];
      return {
        date: entry.date,
        pageviews: entry.pageviews,
        uniqueSessions: entry.uniqueSessionsSet.size,
        downloads: entry.downloads,
      };
    });
    
    const topPages = Object.entries(pageViewsMap)
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
      
    const topReferrers = Object.entries(referrersMap)
      .map(([referrer, visits]) => ({ referrer, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);
      
    return json(200, {
      ok: true,
      range: { start, end },
      totals,
      daily,
      topPages,
      topReferrers,
    });
  } catch (err) {
    console.error('[admin-analytics-summary] Error generating summary:', err);
    return json(500, { ok: false, error: 'Internal server error while compiling stats.' });
  }
};
