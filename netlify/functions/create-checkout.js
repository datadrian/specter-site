const Stripe = require('stripe');
const { json, corsPreflight, readJson } = require('./_lib/http');

const PRODUCTS = Object.freeze({
  imaging: { name: 'SPECTER Imaging License', amount: 19900, env: 'STRIPE_PRICE_IMAGING_ID', legacyEnv: 'STRIPE_PRICE_ID', description: 'Permanent single-device SPECTER Imaging activation.' },
  sdr: { name: 'SPECTER SDR License', amount: 19900, env: 'STRIPE_PRICE_SDR_ID', description: 'Permanent single-device SPECTER SDR activation.' },
  bundle: { name: 'SPECTER Complete Bundle', amount: 34900, env: 'STRIPE_PRICE_BUNDLE_ID', description: 'Permanent SPECTER Imaging and SPECTER SDR activations.' },
});

function priceIdFor(product) {
  const spec = PRODUCTS[product];
  const configured = String(process.env[spec.env] || (spec.legacyEnv ? process.env[spec.legacyEnv] : '') || '').trim();
  return configured.startsWith('price_') ? configured : '';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return json(503, { error: 'Stripe not configured.' });

  const body = readJson(event);
  const product = Object.hasOwn(PRODUCTS, body.product) ? body.product : 'imaging';
  const spec = PRODUCTS[product];
  const priceId = priceIdFor(product);
  const imagingUrl = process.env.SITE_URL || process.env.URL || 'https://specter-imaging.com';
  const sdrUrl = process.env.SDR_SITE_URL || 'https://specter-sdr.netlify.app';
  const returnUrl = product === 'sdr' ? sdrUrl : imagingUrl;
  const email = String(body.email || '').trim();

  const lineItems = priceId ? [{ price: priceId, quantity: 1 }] : [{
    price_data: { currency: 'usd', unit_amount: spec.amount, product_data: { name: spec.name, description: spec.description } },
    quantity: 1,
  }];

  try {
    const session = await Stripe(secret).checkout.sessions.create({
      mode: 'payment', payment_method_types: ['card'], customer_email: email || undefined,
      line_items: lineItems,
      success_url: `${returnUrl}/success.html?product=${product}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}/#pricing`,
      metadata: { product: `specter-${product}` },
    });
    return json(200, { url: session.url });
  } catch (error) {
    console.error('[create-checkout] Stripe session failed:', error.message);
    return json(502, { error: 'Checkout failed to initialize. Please try again or contact support.' });
  }
};

exports.PRODUCTS = PRODUCTS;
