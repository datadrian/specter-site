# Netlify setup — specter-imaging.com

Repo: **https://github.com/datadrian/specter-site**

Deploy this repository (root) to Netlify. Publish directory: **`public`**.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `BREVO_API_KEY` | Brevo transactional email |
| `EMAIL_FROM` | `support@specter-imaging.com` |
| `ADMIN_NOTIFY_EMAIL` | New ticket / demo alerts |
| `ADMIN_PASSWORD` | Login for `/admin/` |
| `ADMIN_API_TOKEN` | Long random bearer token (returned after login) |
| `LICENSE_SALT` | License key checksum salt |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `STRIPE_PRICE_ID` | Optional — if unset, checkout uses inline $399 price |
| `DOWNLOAD_URL` | Optional reference URL for the Windows installer |
| `SITE_URL` | `https://specter-imaging.com` (optional; Netlify sets `URL`) |
| `INBOUND_WEBHOOK_SECRET` | Optional — protect inbound email webhook |

**Never commit API keys to git.**

## Brevo

- Verify domain **specter-imaging.com**
- Sender: **support@specter-imaging.com**
- **IP authorization OFF** (Netlify dynamic IPs)

## Stripe webhook

`https://specter-imaging.com/.netlify/functions/stripe-webhook`  
Event: `checkout.session.completed`

## App integration

The desktop app (`spectral-imaging-unit`) calls:

`POST https://specter-imaging.com/api/activate`

Keys use format `SPTR-XXXX-XXXX-XXXX-XXXX`.

## Installer download

The public download page links to the latest GitHub Release asset:

`https://github.com/datadrian/spectral-imaging-unit/releases/latest/download/SPECTER-Setup.exe`

Build the installer from `spectral-imaging-unit` on Windows, create/update a release on that repo, and upload the EXE as `SPECTER-Setup.exe` so the website URL stays stable.
