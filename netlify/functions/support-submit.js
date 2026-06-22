const { json, corsPreflight, readJson } = require('./_lib/http');
const { createTicket } = require('./_lib/ticket-store');
const { sendTicketConfirmation, sendTicketStaffAlert } = require('./_lib/send-email');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = readJson(event);
  const email = String(body.email || '').trim().toLowerCase();
  const subject = String(body.subject || '').trim();
  const message = String(body.message || body.body || '').trim();

  if (!email || !subject || !message) {
    return json(400, { ok: false, error: 'Email, subject, and message are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { ok: false, error: 'Invalid email address.' });
  }

  const ticket = await createTicket({
    email,
    name: body.name,
    subject,
    body: message,
    source: body.source || 'website',
    machineId: body.machineId || null,
    meta: body.meta || {},
  });

  let confirmationSent = false;
  let staffAlertSent = false;
  try {
    await sendTicketConfirmation({ ticket });
    confirmationSent = true;
  } catch (e) {
    console.error('[support-submit] confirmation failed:', e.message);
  }
  try {
    await sendTicketStaffAlert({ ticket });
    staffAlertSent = true;
  } catch (e) {
    console.error('[support-submit] staff alert failed:', e.message);
  }

  return json(200, {
    ok: true,
    ticketId: ticket.id,
    confirmationSent,
    staffAlertSent,
  });
};
