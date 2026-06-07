// Netlify Function: demo-request
// Logs demo requests and notifies you by email

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

  // Notify you of the demo request
  const msg = {
    to:   process.env.ADMIN_EMAIL || 'admin@specterimaging.com',
    from: {
      email: process.env.FROM_EMAIL || 'license@specterimaging.com',
      name:  'SPECTER Demo Requests',
    },
    subject: `SPECTER // DEMO REQUEST — ${name}`,
    text: `
New demo request:

Name:  ${name}
Email: ${email}
Team:  ${team || 'Not provided'}

Reply to this email to send the demo download link.
    `.trim(),
  };

  try {
    await sgMail.send(msg);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('SendGrid error:', err.message);
    return { statusCode: 500, body: 'Email failed' };
  }
};
