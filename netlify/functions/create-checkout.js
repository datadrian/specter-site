const Stripe = require('stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const configuredPriceId = String(process.env.STRIPE_PRICE_ID || '').trim();
  const priceId = configuredPriceId.startsWith('price_') ? configuredPriceId : '';
  const siteUrl = process.env.SITE_URL || process.env.URL || 'https://specter-imaging.com';

  if (!secret) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY on Netlify.' }),
    };
  }

  let email = '';
  try {
    email = JSON.parse(event.body || '{}').email || '';
  } catch (_) {}

  const stripe = Stripe(secret);
  if (configuredPriceId && !priceId) {
    console.warn('[create-checkout] Ignoring STRIPE_PRICE_ID because it is not a price_ ID:', configuredPriceId);
  }

  const lineItems = priceId
    ? [{ price: priceId, quantity: 1 }]
    : [{
        price_data: {
          currency: 'usd',
          unit_amount: 39900,
          product_data: {
            name: 'SPECTER // FIELD LICENSE',
            description: 'Single-device permanent activation. Key delivered by email.',
          },
        },
        quantity: 1,
      }];

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: lineItems,
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#pricing`,
      metadata: { product: 'specter-license' },
    });
  } catch (err) {
    console.error('[create-checkout] Stripe session failed:', err.message);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Checkout failed to initialize. Please try again or contact support.' }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: session.url }),
  };
};
