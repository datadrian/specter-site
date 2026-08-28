const Stripe = require('stripe');
const { configureStore, listRecords, mintAndSave } = require('./_lib/license-store');
const { sendLicenseEmail, sendBundleLicenseEmail } = require('./_lib/send-email');

function purchaseProduct(metadataProduct) {
  const value = String(metadataProduct || '').toLowerCase();
  if (value === 'specter-sdr') return 'sdr';
  if (value === 'specter-bundle') return 'bundle';
  return 'imaging';
}

async function fulfillSession(session) {
  const email = (session.customer_details?.email || session.customer_email || '').trim().toLowerCase();
  const product = purchaseProduct(session.metadata?.product);
  const existing = (await listRecords()).filter(record => record.stripeSessionId === session.id);
  const records = [...existing];

  async function ensureLicense(licenseProduct) {
    let record = records.find(item => (item.product || 'imaging') === licenseProduct);
    if (!record) {
      record = await mintAndSave({
        email, type: 'retail', product: licenseProduct, purchaseProduct: product,
        note: product === 'bundle' ? 'SPECTER Complete bundle purchase' : `SPECTER ${licenseProduct === 'sdr' ? 'SDR' : 'Imaging'} purchase`,
        stripeSessionId: session.id,
      });
      records.push(record);
    }
    return record;
  }

  if (product === 'bundle') {
    const imaging = await ensureLicense('imaging');
    const sdr = await ensureLicense('sdr');
    if (email && existing.length === 0) await sendBundleLicenseEmail({ to: email, imagingKey: imaging.key, sdrKey: sdr.key });
    return { product, records: [imaging, sdr] };
  }

  const record = await ensureLicense(product);
  if (email && existing.length === 0) await sendLicenseEmail({ to: email, key: record.key, type: 'retail', product });
  return { product, records: [record] };
}

exports.handler = async (event) => {
  configureStore(event);
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) return { statusCode: 503, body: 'Stripe webhook not configured' };
  let stripeEvent;
  try {
    stripeEvent = Stripe(secret).webhooks.constructEvent(event.body, event.headers['stripe-signature'], webhookSecret);
  } catch (error) {
    return { statusCode: 400, body: `Webhook Error: ${error.message}` };
  }
  if (stripeEvent.type === 'checkout.session.completed') {
    try {
      const fulfilled = await fulfillSession(stripeEvent.data.object);
      console.log('[stripe-webhook] fulfilled', fulfilled.product, fulfilled.records.map(record => record.key).join(','));
    } catch (error) {
      console.error('[stripe-webhook] fulfillment failed:', error.message);
      return { statusCode: 500, body: 'License fulfillment failed' };
    }
  }
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

exports.fulfillSession = fulfillSession;
exports.purchaseProduct = purchaseProduct;
