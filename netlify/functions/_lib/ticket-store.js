const crypto = require('crypto');

const mem = new Map();
let blobStore = null;

try {
  const { getStore } = require('@netlify/blobs');
  blobStore = getStore({ name: 'specter-tickets', consistency: 'strong' });
} catch (_) {}

function ticketKey(id) {
  return String(id || '').trim().toUpperCase();
}

function makeTicketId() {
  return `TKT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

async function getTicket(id) {
  const key = ticketKey(id);
  if (blobStore) return blobStore.get(key, { type: 'json' });
  return mem.get(key) || null;
}

async function saveTicket(ticket) {
  const key = ticketKey(ticket.id);
  if (blobStore) {
    await blobStore.setJSON(key, ticket);
    return ticket;
  }
  mem.set(key, ticket);
  return ticket;
}

async function listTickets() {
  if (blobStore) {
    const { blobs } = await blobStore.list();
    const out = [];
    for (const blob of blobs || []) {
      const t = await blobStore.get(blob.key, { type: 'json' });
      if (t) out.push(t);
    }
    return out.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }
  return Array.from(mem.values()).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

async function createTicket({ email, name, subject, body, source, machineId, meta }) {
  const now = new Date().toISOString();
  const ticket = {
    id: makeTicketId(),
    createdAt: now,
    updatedAt: now,
    status: 'open',
    email: String(email || '').trim().toLowerCase(),
    name: String(name || '').trim(),
    subject: String(subject || '').trim().slice(0, 200),
    source: source || 'website',
    machineId: machineId || null,
    meta: meta || {},
    messages: [{
      id: crypto.randomBytes(4).toString('hex'),
      from: 'customer',
      body: String(body || '').trim(),
      at: now,
      email: String(email || '').trim().toLowerCase(),
    }],
  };
  await saveTicket(ticket);
  return ticket;
}

async function addReply(ticketId, { from, body, email }) {
  const ticket = await getTicket(ticketId);
  if (!ticket) return null;
  const now = new Date().toISOString();
  ticket.messages = ticket.messages || [];
  ticket.messages.push({
    id: crypto.randomBytes(4).toString('hex'),
    from: from || 'staff',
    body: String(body || '').trim(),
    at: now,
    email: email || null,
  });
  ticket.updatedAt = now;
  if (from === 'staff' && ticket.status === 'open') ticket.status = 'waiting';
  await saveTicket(ticket);
  return ticket;
}

async function setTicketStatus(ticketId, status) {
  const ticket = await getTicket(ticketId);
  if (!ticket) return null;
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  await saveTicket(ticket);
  return ticket;
}

module.exports = {
  getTicket,
  saveTicket,
  listTickets,
  createTicket,
  addReply,
  setTicketStatus,
};
