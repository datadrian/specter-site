const Stripe = require('stripe');
const { configureStore, mintAndSave } = require('./_lib/license-store');
const { sendLicenseEmail } = require('./_lib/send-email');

exports.handler = async (event) => {
  configureStore(event);
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) {
    return { statusCode: 503, body: 'Stripe webhook not configured' };
  }

  const stripe = Stripe(secret);
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      event.headers['stripe-signature'],
      webhookSecret,
    );
  } catch (err) {
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const email = (session.customer_details?.email || session.customer_email || '').trim().toLowerCase();
    const record = await mintAndSave({
      email,
      type: 'retail',
      note: 'Stripe purchase',
      stripeSessionId: session.id,
    });
    console.log('[stripe-webhook] license minted for', email, record.key);

    if (email) {
      try {
        await sendLicenseEmail({ to: email, key: record.key, type: 'retail' });
        console.log('[stripe-webhook] license email sent to', email);
      } catch (e) {
        console.error('[stripe-webhook] email failed:', e.message);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
