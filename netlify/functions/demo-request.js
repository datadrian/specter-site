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
      subject: `SPECTER website question — ${name}`,
      html: `<p><strong>Website question before download</strong></p>
        <p>Name: ${name}<br>Email: ${email}<br>Team: ${team || '—'}</p>
        <p>The public demo download is available at <a href="https://specter-imaging.com/download.html">specter-imaging.com/download.html</a>.</p>`,
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Website question email failed:', err.message);
    return { statusCode: 500, body: 'Email failed' };
  }
};
