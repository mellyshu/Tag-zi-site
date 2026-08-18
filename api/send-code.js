// Vercel serverless function: POST /api/send-code
// Generates a 6-digit login code, emails it via Resend, and returns a signed
// token the browser can present back to /api/verify-code — no database needed.
//
// Requires these environment variables to be set in the Vercel project:
//   RESEND_API_KEY  — API key from resend.com
//   OTP_SECRET      — any long random string, e.g. `openssl rand -hex 32`
//   EMAIL_FROM      — e.g. "Tagzi <login@tagzi.com>" (must be on a domain
//                      you've verified in Resend)
//
// If these aren't set yet, this returns a 500 with `notConfigured: true` and
// the front end falls back to showing the code on-screen ("test mode") so
// the login flow keeps working while you're setting things up.

const crypto = require('crypto');

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const email = body && body.email;

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }

  const secret = process.env.OTP_SECRET;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM;

  if (!secret || !resendApiKey || !fromAddress) {
    res.status(500).json({
      error: 'Email sending is not configured yet on the server.',
      notConfigured: true
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + OTP_TTL_MS;
  const token = sign(`${normalizedEmail}:${code}:${expiresAt}`, secret);

  try {
    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [normalizedEmail],
        subject: `Your Tagzi login code: ${code}`,
        html: `
          <div style="font-family:sans-serif;max-width:420px;margin:0 auto;">
            <p>Your Tagzi login code is:</p>
            <p style="font-size:32px;font-weight:800;letter-spacing:6px;">${code}</p>
            <p style="color:#666;font-size:13px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
          </div>
        `
      })
    });

    if (!emailResp.ok) {
      const errText = await emailResp.text();
      console.error('Resend error:', emailResp.status, errText);
      res.status(502).json({ error: 'Could not send the email right now. Please try again.' });
      return;
    }
  } catch (err) {
    console.error('send-code failed:', err);
    res.status(502).json({ error: 'Could not send the email right now. Please try again.' });
    return;
  }

  res.status(200).json({ token, expiresAt });
};
