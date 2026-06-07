// Netlify Function: demo-request
// Logs demo requests and notifies admin via Resend

async function sendEmail({ to, subject, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `SPECTER Demo Requests <${process.env.FROM_EMAIL || 'license@specterimaging.com'}>`,
      to: [to],
      subject,
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

  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'admin@specterimaging.com',
      subject: `SPECTER // DEMO REQUEST — ${name}`,
      text: `New demo request:\n\nName:  ${name}\nEmail: ${email}\nTeam:  ${team || 'Not provided'}\n\nReply to send the demo download link.`,
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Resend error:', err.message);
    return { statusCode: 500, body: 'Email failed' };
  }
};
