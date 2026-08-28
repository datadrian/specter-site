const BUY_URL = 'https://specter-imaging.com';
const HELP_URL = `${BUY_URL}/help/`;
const SDR_URL = process.env.SDR_SITE_URL || 'https://specter-sdr.netlify.app';
const SUPPORT_EMAIL = process.env.EMAIL_FROM || 'support@specter-imaging.com';

async function brevoSend({ to, subject, html, replyTo }) {
  const brevoKey = process.env.BREVO_API_KEY;
  const resendKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY;
  const from = SUPPORT_EMAIL;

  if (brevoKey) {
    const payload = {
      sender: { name: 'SPECTER Support', email: from },
      to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
      subject,
      htmlContent: html,
    };
    if (replyTo) payload.replyTo = { email: replyTo };
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Brevo send failed: ${await res.text()}`);
    return { provider: 'brevo' };
  }

  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `SPECTER Support <${from}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        reply_to: replyTo || undefined,
      }),
    });
    if (!res.ok) throw new Error(`Resend send failed: ${await res.text()}`);
    return { provider: 'resend' };
  }

  throw new Error('No email provider configured. Set BREVO_API_KEY on Netlify.');
}

function productInfo(product) {
  if (product === 'sdr') return { name: 'SPECTER SDR', helpUrl: `${SDR_URL}/help/`, steps: ['Open SPECTER SDR', 'Open Settings, then License', 'Paste the SSDR key and select Activate license'] };
  return { name: 'SPECTER Imaging', helpUrl: HELP_URL, steps: ['Open SPECTER Imaging on your field unit', 'Open Settings, then License', 'Paste the SPTR key and select Activate license'] };
}

function licenseBlock({ key, product }) {
  const info = productInfo(product);
  return `<div style="border:1px solid #1f5360;padding:16px;margin:14px 0;background:#f6fbfc">
    <p style="margin:0 0 8px"><strong>${info.name}</strong></p>
    <p style="margin:0"><strong>License key:</strong> <code style="font-size:16px;letter-spacing:0.08em">${escapeHtml(key)}</code></p>
  </div>`;
}

async function sendLicenseEmail({ to, key, type, product = 'imaging' }) {
  const label = type === 'comp' ? 'complimentary' : 'purchased';
  const info = productInfo(product);
  return brevoSend({
    to,
    subject: `Your ${info.name} License Key`,
    html: `
      <p>Thank you. Here is your ${label} ${info.name} license key.</p>
      ${licenseBlock({ key, product })}
      <ol>${info.steps.map(step => `<li>${step}</li>`).join('')}</ol>
      <p>Each key binds to <strong>one computer</strong>. Offline use works after activation.</p>
      <p>Help: <a href="${info.helpUrl}">${info.helpUrl}</a><br>
      Support: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
    `,
  });
}

async function sendBundleLicenseEmail({ to, imagingKey, sdrKey }) {
  return brevoSend({
    to,
    subject: 'Your SPECTER Complete License Keys',
    html: `
      <p>Thank you for purchasing SPECTER Complete. Your bundle includes two separate application licenses.</p>
      ${licenseBlock({ key: imagingKey, product: 'imaging' })}
      ${licenseBlock({ key: sdrKey, product: 'sdr' })}
      <p>Activate each key inside its matching application under <strong>Settings, then License</strong>. SPTR keys activate SPECTER Imaging. SSDR keys activate SPECTER SDR.</p>
      <p>Each key binds to one computer. Both applications continue to work offline after activation.</p>
      <p>Imaging help: <a href="${HELP_URL}">${HELP_URL}</a><br>
      SDR help: <a href="${SDR_URL}/help/">${SDR_URL}/help/</a><br>
      Support: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
    `,
  });
}

async function sendTicketConfirmation({ ticket }) {
  const helpUrl = ticket.meta?.product === 'sdr' ? `${SDR_URL}/help/` : HELP_URL;
  const supportUrl = ticket.meta?.product === 'sdr' ? `${SDR_URL}/support.html` : `${BUY_URL}/support.html`;
  return brevoSend({
    to: ticket.email,
    subject: `[${ticket.id}] ${ticket.subject}`,
    replyTo: SUPPORT_EMAIL,
    html: `
      <p>We received your support request.</p>
      <p><strong>Ticket:</strong> ${ticket.id}<br>
      <strong>Subject:</strong> ${ticket.subject}</p>
      <blockquote style="border-left:3px solid #6ad7a8;padding-left:12px;color:#555">
        ${escapeHtml(ticket.messages?.[0]?.body || '')}
      </blockquote>
      <p>Reply to this email or visit <a href="${supportUrl}">our support page</a> with your ticket ID.</p>
      <p>Help center: <a href="${helpUrl}">${helpUrl}</a></p>
    `,
  });
}

async function sendTicketStaffReply({ ticket, replyBody }) {
  const helpUrl = ticket.meta?.product === 'sdr' ? `${SDR_URL}/help/` : HELP_URL;
  return brevoSend({
    to: ticket.email,
    subject: `Re: [${ticket.id}] ${ticket.subject}`,
    replyTo: SUPPORT_EMAIL,
    html: `
      <p><strong>SPECTER Support</strong> replied to ticket ${ticket.id}:</p>
      <blockquote style="border-left:3px solid #6ad7a8;padding-left:12px">
        ${escapeHtml(replyBody)}
      </blockquote>
      <p>Reply to this email to continue the conversation.<br>
      Help: <a href="${helpUrl}">${helpUrl}</a></p>
    `,
  });
}

async function sendTicketStaffAlert({ ticket }) {
  const notify = process.env.ADMIN_NOTIFY_EMAIL || SUPPORT_EMAIL;
  return brevoSend({
    to: notify,
    subject: `[New ticket ${ticket.id}] ${ticket.subject}`,
    html: `
      <p>New support ticket from ${escapeHtml(ticket.name || ticket.email)}</p>
      <p><strong>ID:</strong> ${ticket.id}<br>
      <strong>Source:</strong> ${ticket.source}<br>
      <strong>Email:</strong> ${ticket.email}</p>
      <blockquote>${escapeHtml(ticket.messages?.[0]?.body || '')}</blockquote>
      <p><a href="${BUY_URL}/admin/">Open admin portal</a></p>
    `,
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  sendLicenseEmail,
  sendBundleLicenseEmail,
  sendTicketConfirmation,
  sendTicketStaffReply,
  sendTicketStaffAlert,
  brevoSend,
  SUPPORT_EMAIL,
  SDR_URL,
};
