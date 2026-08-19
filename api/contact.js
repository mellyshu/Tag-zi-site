// Vercel serverless function: POST /api/contact
// Sends a "Contact Us" message from the app to the site owner via Resend.
// Reuses the same RESEND_API_KEY / EMAIL_FROM environment variables already
// set up for the login-code emails — no extra setup needed.

const CONTACT_TO = 'mshultzliquidation@gmail.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LEN = 4000;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  const message = body && typeof body.message === 'string' ? body.message.trim() : '';
  const fromEmailRaw = body && typeof body.fromEmail === 'string' ? body.fromEmail.trim() : '';
  const fromEmail = EMAIL_RE.test(fromEmailRaw) ? fromEmailRaw.toLowerCase() : null;

  if (!message) {
    res.status(400).json({ error: 'Please describe your issue before sending.' });
    return;
  }
  if (message.length > MAX_MESSAGE_LEN) {
    res.status(400).json({ error: 'That message is too long. Please shorten it a bit.' });
    return;
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM;

  if (!resendApiKey || !fromAddress) {
    res.status(500).json({
      error: 'Contact form is not fully configured yet on the server.',
      notConfigured: true
    });
    return;
  }

  try {
    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [CONTACT_TO],
        reply_to: fromEmail || undefined,
        subject: `Tagzi Contact Form${fromEmail ? ` — ${fromEmail}` : ''}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
            <p><strong>New message from the Tagzi Contact Us form:</strong></p>
            ${fromEmail ? `<p style="color:#666;font-size:13px;">From account: ${escapeHtml(fromEmail)}</p>` : ''}
            <p style="white-space:pre-wrap;border-left:3px solid #4f3df6;padding-left:12px;margin:16px 0;">${escapeHtml(message)}</p>
          </div>
        `
      })
    });

    if (!emailResp.ok) {
      const errText = await emailResp.text();
      console.error('Resend error:', emailResp.status, errText);
      res.status(502).json({ error: 'Could not send your message right now. Please try again.' });
      return;
    }
  } catch (err) {
    console.error('contact failed:', err);
    res.status(502).json({ error: 'Could not send your message right now. Please try again.' });
    return;
  }

  res.status(200).json({ ok: true });
};
