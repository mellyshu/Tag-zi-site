// Vercel serverless function: POST /api/verify-code
// Re-derives the signed token from /api/send-code and checks it matches,
// without needing a database. Requires OTP_SECRET (same value used in
// send-code.js) to be set in the Vercel project's environment variables.

const crypto = require('crypto');

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { email, code, token, expiresAt } = body || {};

  const secret = process.env.OTP_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Email sending is not configured yet on the server.', notConfigured: true });
    return;
  }
  if (!email || !code || !token || !expiresAt) {
    res.status(400).json({ error: 'Missing information.' });
    return;
  }
  if (Date.now() > Number(expiresAt)) {
    res.status(400).json({ error: 'This code has expired. Request a new one.' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const expectedToken = sign(`${normalizedEmail}:${code}:${expiresAt}`, secret);

  const a = Buffer.from(String(token));
  const b = Buffer.from(expectedToken);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!valid) {
    res.status(400).json({ error: 'Incorrect code. Please try again.' });
    return;
  }

  res.status(200).json({ ok: true });
};
