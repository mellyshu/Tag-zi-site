# Tagzi

A label-printing tool for numbering and printing labels for sold inventory
(built for live-sale / auction workflows). Recreated as a static site.

## What's included
- `index.html` / `style.css` / `app.js` — the full app, no build step needed.
- Category cards you click to print the next sequential label per category.
- Add/reset/delete categories, "Today's history" with reprint, "Reset Day"
  archiving into a "Past Days" sidebar, and CSV export of history/totals per day.
- Labels print at exactly 1.5in x 0.5in (38mm x 13mm) for thermal/roll printers.
- A "How to use Tagzi" help modal matching your original instructions.

## Important: data storage
This version stores all data **locally in each browser** (localStorage), keyed
to the email you log in with — there is no real user-account backend yet, so
data will NOT sync between devices or browsers. The original app mentioned
"log in from any device" — to make that real (shared login + data synced
across devices), it needs a small backend + database. Happy to build that
next if you want true multi-device sync — just say the word.

## Login: email + code
The login screen asks for an email, then a 6-digit code — a "magic code"
login, no password. The `api/` folder has the backend pieces (Vercel
serverless functions) that generate the code, email it through Resend, and
verify it — with no database, using a signed token instead. **Until that
backend is deployed and configured, the app automatically falls back to
showing the code on-screen** in a "test mode" banner, so the login flow
always works even before email sending is set up.

### Wiring up real email delivery (Resend + Vercel)
1. Create a free account at [resend.com](https://resend.com).
2. In Resend, go to **Domains → Add Domain** and add `tagzi.com`. Resend
   gives you a few DNS records (TXT/DKIM, and usually an MX record) — add
   those at your domain registrar. Verification can take anywhere from a
   few minutes to a few hours.
3. In Resend, go to **API Keys → Create API Key** and copy it.
4. Deploy this project to [Vercel](https://vercel.com) — either connect this
   folder's repo in the Vercel dashboard ("Import Project"), or install the
   CLI (`npm i -g vercel`) and run `vercel` from this folder. Vercel
   auto-detects the `api/` folder as serverless functions; no config needed.
5. In the Vercel project's **Settings → Environment Variables**, add:
   - `RESEND_API_KEY` — the key from step 3.
   - `OTP_SECRET` — any long random string, used to sign codes securely
     (generate one with `openssl rand -hex 32`, or any password generator).
   - `EMAIL_FROM` — e.g. `Tagzi <login@tagzi.com>` (must be on the domain
     you verified in step 2).
6. Redeploy (Vercel does this automatically after you add env vars, or
   trigger one manually from the dashboard).
7. Point tagzi.com's DNS at Vercel — the project's **Settings → Domains**
   tab shows exactly which records to add at your registrar. This makes
   tagzi.com serve both the site and the `/api` functions together.
8. Test it: open your live site, enter your email, and you should get a
   real email with the code within a few seconds.

If you'd rather use a different provider (SendGrid, Postmark, Mailgun,
Amazon SES, etc.) instead of Resend, the same pattern works — just swap the
`fetch('https://api.resend.com/emails', ...)` call in `api/send-code.js` for
that provider's API, and use its API key as the env var instead.

## How to deploy to tagzi.com
**If you want real email codes (recommended):** use Vercel as described
above — it hosts the static site and the `api/` functions together.

**If you don't need real email yet:** any static host works (Netlify,
Cloudflare Pages, GitHub Pages) — upload `index.html`, `style.css`, and
`app.js`, then point tagzi.com's DNS at that host per its instructions. The
login will run in test mode (code shown on-screen) until you add a backend.

I can also just hand you a ready-to-upload zip — see the file sent alongside
this README.
