const Stripe = require('stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
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

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email || undefined,
    line_items: lineItems,
    success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/#pricing`,
    metadata: { product: 'specter-license' },
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: session.url }),
  };
};
