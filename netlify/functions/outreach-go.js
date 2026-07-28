// outreach-go.js - the public "clean tracking link" redirect used in outreach
// drafts instead of a raw ?utm_ query string. A visible tracking parameter in a
// message someone typed themselves looks like a marketing tool and undermines
// the whole "genuine, disclosed" tone the outreach system is built around - so
// drafts reference "specter-imaging.com/r/<slug>" instead, which reads as a
// normal-looking link in prose. This function looks up which community a slug
// belongs to, logs the click (so we can still see which community drove
// traffic), then redirects to the homepage. Never 404s on an unknown slug -
// always redirects somewhere reasonable, since the visitor already clicked a
// real link and a dead end would just look broken.
const { configureStore: configureOutreachStore, getCommunityBySlug } = require('./_lib/outreach-store');
const { configureStore: configureAnalyticsStore, recordEvent } = require('./_lib/analytics-store');

const DESTINATION = 'https://specter-imaging.com/';

exports.handler = async (event) => {
  const slug = (event.queryStringParameters && event.queryStringParameters.slug) || '';

  let community = null;
  try {
    configureOutreachStore(event);
    community = await getCommunityBySlug(slug);
  } catch (err) {
    console.error('[outreach-go] community lookup failed:', err.message);
  }

  try {
    configureAnalyticsStore(event);
    await recordEvent({
      type: 'outreach_referral',
      path: `/r/${slug}`,
      referrer: '',
      sessionId: '',
      ts: new Date().toISOString(),
      userAgent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || '',
      trackingSlug: slug,
      communityId: community ? community.id : '',
      communityName: community ? community.name : '',
    });
  } catch (err) {
    // Never block the redirect on a logging failure.
    console.error('[outreach-go] failed to record referral event:', err.message);
  }

  return {
    statusCode: 302,
    headers: {
      Location: DESTINATION,
      'Cache-Control': 'no-store',
    },
    body: '',
  };
};
