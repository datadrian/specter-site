const { json, corsPreflight, readJson } = require('./_lib/http');
const { requireAdmin } = require('./_lib/auth');
const { configureStore, listRecords, mintAndSave, saveRecord } = require('./_lib/license-store');
const { sendLicenseEmail } = require('./_lib/send-email');

function normKey(key) {
  return String(key || '').trim().toUpperCase();
}

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isPurchaseLike(record) {
  const type = record.type || 'retail';
  return type === 'retail' || type === 'replacement';
}

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
        replacementFor: r.replacementFor || null,
        replacedAt: r.replacedAt || null,
        replacedBy: r.replacedBy || null,
      })),
    });
  }

  if (event.httpMethod === 'POST') {
    const body = readJson(event);
    if (body.action === 'replacement' || body.type === 'replacement') {
      const records = await listRecords();
      const originalKey = normKey(body.originalKey || body.key);
      const email = normEmail(body.email);
      const candidates = records.filter(r => isPurchaseLike(r));
      const original = originalKey
        ? candidates.find(r => normKey(r.key) === originalKey)
        : candidates.find(r => normEmail(r.email) === email);

      if (!original) {
        return json(404, {
          ok: false,
          error: 'No existing purchased license found for that key or email.',
        });
      }

      const note = body.note || `Replacement key for ${original.key}`;
      const record = await mintAndSave({
        email: original.email || email,
        type: 'replacement',
        note,
        replacementFor: original.key,
      });

      const updatedOriginal = {
        ...original,
        replacedAt: new Date().toISOString(),
        replacedBy: record.key,
        replacementReason: body.note || null,
      };
      await saveRecord(original.key, updatedOriginal);

      let emailSent = false;
      if (record.email) {
        try {
          await sendLicenseEmail({ to: record.email, key: record.key, type: record.type });
          emailSent = true;
        } catch (e) {
          console.error('[admin-licenses] replacement email failed:', e.message);
        }
      }

      return json(200, {
        ok: true,
        license: record,
        original: {
          key: updatedOriginal.key,
          email: updatedOriginal.email,
          replacedAt: updatedOriginal.replacedAt,
          replacedBy: updatedOriginal.replacedBy,
        },
        emailSent,
      });
    }

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
