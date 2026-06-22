const { brevoSend, SUPPORT_EMAIL } = require('./_lib/send-email');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { name, email, team } = data;
  const notify = process.env.ADMIN_NOTIFY_EMAIL || SUPPORT_EMAIL;

  try {
    await brevoSend({
      to: notify,
      subject: `SPECTER demo request — ${name}`,
      html: `<p><strong>Demo request</strong></p>
        <p>Name: ${name}<br>Email: ${email}<br>Team: ${team || '—'}</p>
        <p>Reply to send demo info or a comp key from <a href="https://specter-imaging.com/admin/">admin</a>.</p>`,
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Demo request email failed:', err.message);
    return { statusCode: 500, body: 'Email failed' };
  }
};
