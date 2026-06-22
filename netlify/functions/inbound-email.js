const { json } = require('./_lib/http');
const { createTicket, getTicket, addReply } = require('./_lib/ticket-store');
const { sendTicketConfirmation, sendTicketStaffAlert } = require('./_lib/send-email');

// Brevo inbound email webhook — configure in Brevo when support@specter-imaging.com receives mail.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const secret = process.env.INBOUND_WEBHOOK_SECRET || '';
  if (secret) {
    const got = event.headers['x-specter-secret'] || event.queryStringParameters?.secret || '';
    if (got !== secret) return json(401, { error: 'Unauthorized' });
  }

  let data = {};
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const from = (data.from?.email || data.sender?.email || data.From || data.from || '').toString().trim().toLowerCase();
  const subject = (data.subject || data.Subject || '(no subject)').toString();
  const body = (data.text || data.TextBody || data.html || data.HtmlBody || '').toString().replace(/<[^>]+>/g, ' ').trim();

  if (!from) return json(400, { error: 'Missing sender' });

  const ticketMatch = /\[?(TKT-[A-Z0-9-]+)\]?/i.exec(subject);
  if (ticketMatch) {
    const existing = await getTicket(ticketMatch[1]);
    if (existing) {
      await addReply(existing.id, { from: 'customer', body, email: from });
      return json(200, { ok: true, action: 'reply', ticketId: existing.id });
    }
  }

  const ticket = await createTicket({
    email: from,
    name: data.from?.name || from,
    subject,
    body: body || subject,
    source: 'email',
  });

  try { await sendTicketConfirmation({ ticket }); } catch (e) { console.error(e.message); }
  try { await sendTicketStaffAlert({ ticket }); } catch (e) { console.error(e.message); }

  return json(200, { ok: true, action: 'created', ticketId: ticket.id });
};
