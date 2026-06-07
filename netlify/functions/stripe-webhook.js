// Netlify Function: stripe-webhook
// Handles Stripe payment success → generates license key → sends email via Resend

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

// Generate a unique license key: SPCT-XXXX-XXXX-XXXX-XXXX
function generateLicenseKey() {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(2).toString('hex').toUpperCase());
  }
  return `SPCT-${segments.join('-')}`;
}

async function sendEmail({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `SPECTER Paranormal Imaging <${process.env.FROM_EMAIL || 'license@specterimaging.com'}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
  return res.json();
}

exports.handler = async (event) => {
  const sig    = event.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, secret);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session    = stripeEvent.data.object;
    const email      = session.customer_details?.email;
    const name       = session.customer_details?.name || 'Investigator';
    const sessionId  = session.id;
    const licenseKey = generateLicenseKey();

    console.log(`Payment confirmed: ${email} — License: ${licenseKey}`);

    const html = `
<!DOCTYPE html>
<html>
<head>
<style>
  body { background:#070a0f; color:#c8d4e0; font-family:'Courier New',monospace; margin:0; padding:0; }
  .wrap { max-width:600px; margin:0 auto; padding:2rem; }
  .header { border-bottom:2px solid #00e5ff; padding-bottom:1.5rem; margin-bottom:2rem; }
  .title { font-size:2rem; color:#00e5ff; letter-spacing:0.2em; font-weight:bold; }
  .subtitle { font-size:0.7rem; color:#667080; letter-spacing:0.15em; margin-top:0.25rem; }
  .key-block { background:#0c1018; border:1px solid #00e5ff; padding:1.5rem; margin:1.5rem 0; text-align:center; }
  .key-label { font-size:0.65rem; color:#667080; letter-spacing:0.15em; margin-bottom:0.5rem; }
  .key { font-size:1.5rem; color:#00e5ff; letter-spacing:0.2em; font-weight:bold; }
  .download-btn { display:block; background:#00e5ff; color:#000; text-decoration:none; font-weight:bold; letter-spacing:0.1em; padding:1rem 2rem; text-align:center; margin:1.5rem 0; font-size:0.85rem; }
  .section { margin:1.5rem 0; }
  .section-title { font-size:0.65rem; color:#00e5ff; letter-spacing:0.15em; margin-bottom:0.5rem; border-bottom:1px solid rgba(0,229,255,0.15); padding-bottom:0.4rem; }
  .row { font-size:0.8rem; color:#667080; padding:0.3rem 0; }
  .footer { border-top:1px solid rgba(0,229,255,0.15); margin-top:2rem; padding-top:1rem; font-size:0.65rem; color:#667080; letter-spacing:0.1em; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="title">SPECTER</div>
    <div class="subtitle">// PARANORMAL IMAGING SYSTEM // FIELD LICENSE</div>
  </div>
  <p style="color:#c8d4e0;font-size:0.9rem;">License confirmed for <strong style="color:#fff">${name}</strong>. Your activation key is below.</p>
  <div class="key-block">
    <div class="key-label">LICENSE KEY</div>
    <div class="key">${licenseKey}</div>
  </div>
  <p style="font-size:0.8rem;color:#667080;">Enter this key on first launch. The license is bound to one device permanently.</p>
  <a href="${process.env.DOWNLOAD_URL || 'https://specterimaging.com/download'}" class="download-btn">DOWNLOAD SPECTER v12.0</a>
  <div class="section">
    <div class="section-title">ORDER REFERENCE</div>
    <div class="row">Session ID: ${sessionId}</div>
  </div>
  <div class="section">
    <div class="section-title">SYSTEM REQUIREMENTS</div>
    <div class="row">✓ Windows 10 / 11 (x64)</div>
    <div class="row">✓ USB 3.0 port (for RealSense D435i)</div>
    <div class="row">⚠ Kinect for Windows Runtime required for Kinect V2</div>
  </div>
  <div class="footer">
    Support: support@specterimaging.com<br/>
    © 2026 SPECTER PARANORMAL IMAGING SYSTEM
  </div>
</div>
</body>
</html>`;

    const text = `
SPECTER PARANORMAL IMAGING SYSTEM — FIELD LICENSE

Order ID: ${sessionId}
License Key: ${licenseKey}

Enter this key on first launch. Bound to one device permanently.

Download: ${process.env.DOWNLOAD_URL || 'https://specterimaging.com/download'}

System Requirements:
- Windows 10 / 11 (x64)
- USB 3.0 port (RealSense D435i)
- Kinect for Windows Runtime (Kinect V2 only)

Support: support@specterimaging.com
    `.trim();

    try {
      await sendEmail({ to: email, subject: 'SPECTER // FIELD LICENSE — Activation Key', html, text });
      console.log(`License email sent to ${email}`);
    } catch (emailErr) {
      console.error('Resend error:', emailErr.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
