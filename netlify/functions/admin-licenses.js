const { json, corsPreflight, readJson } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, listRecords, mintAndSave } = require('./_lib/license-store');
const { sendLicenseEmail } = require('./_lib/send-email');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsPreflight();

  const auth = requireAdmin(event);
  if (!auth.authorized) return auth.response;
  configureStore(event);

  if (event.httpMethod === 'GET') {
    const records = await listRecords();
    return json(200, {
      ok: true,
      licenses: records.map(r => ({
        key: r.key,
        email: r.email,
        type: r.type || 'retail',
        note: r.note,
        machineId: r.machineId ? `${r.machineId.slice(0, 8)}…` : null,
        machineIdFull: r.machineId || null,
        purchasedAt: r.purchasedAt,
        activatedAt: r.activatedAt,
      })),
    });
  }

  if (event.httpMethod === 'POST') {
    const body = readJson(event);
    const type = body.type === 'dev' ? 'dev' : 'comp';
    const record = await mintAndSave({
      email: body.email,
      type,
      note: body.note || (type === 'comp' ? 'Complimentary key' : 'Dev key'),
    });

    let emailSent = false;
    if (body.email) {
      try {
        await sendLicenseEmail({ to: body.email, key: record.key, type: record.type });
        emailSent = true;
      } catch (e) {
        console.error('[admin-licenses] email failed:', e.message);
      }
    }

    return json(200, { ok: true, license: record, emailSent });
  }

  return json(405, { error: 'Method not allowed' });
};
