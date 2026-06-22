const { json, corsPreflight, readJson } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { listTickets, getTicket, addReply, setTicketStatus } = require('./_lib/ticket-store');
const { sendTicketStaffReply } = require('./_lib/send-email');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();

  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;

  const ticketId = event.queryStringParameters?.id;

  if (event.httpMethod === 'GET') {
    if (ticketId) {
      const ticket = await getTicket(ticketId);
      if (!ticket) return json(404, { ok: false, error: 'Ticket not found.' });
      return json(200, { ok: true, ticket });
    }
    const tickets = await listTickets();
    return json(200, {
      ok: true,
      tickets: tickets.map(t => ({
        id: t.id,
        status: t.status,
        subject: t.subject,
        email: t.email,
        name: t.name,
        source: t.source,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        messageCount: (t.messages || []).length,
      })),
    });
  }

  if (event.httpMethod === 'POST' && ticketId) {
    const body = readJson(event);
    const ticket = await addReply(ticketId, { from: 'staff', body: body.message, email: 'support@specter-imaging.com' });
    if (!ticket) return json(404, { ok: false, error: 'Ticket not found.' });

    let emailSent = false;
    if (body.sendEmail !== false && ticket.email) {
      try {
        await sendTicketStaffReply({ ticket, replyBody: body.message });
        emailSent = true;
      } catch (e) {
        console.error('[admin-tickets] reply email failed:', e.message);
      }
    }

    return json(200, { ok: true, ticket, emailSent });
  }

  if (event.httpMethod === 'PATCH' && ticketId) {
    const body = readJson(event);
    const status = body.status;
    if (!['open', 'waiting', 'closed'].includes(status)) {
      return json(400, { ok: false, error: 'Invalid status.' });
    }
    const ticket = await setTicketStatus(ticketId, status);
    if (!ticket) return json(404, { ok: false, error: 'Ticket not found.' });
    return json(200, { ok: true, ticket });
  }

  return json(405, { error: 'Method not allowed' });
};
