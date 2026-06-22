# specter-site

**https://github.com/datadrian/specter-site**

Public site for [specter-imaging.com](https://specter-imaging.com): marketing, Stripe checkout, license activation API, help center, support tickets, and operator admin portal.

The SPECTER desktop app lives in a separate repo: [spectral-imaging-unit](https://github.com/datadrian/spectral-imaging-unit).

## Structure

| Path | Purpose |
|------|---------|
| `public/` | Static site (marketing homepage, help, support, admin UI) |
| `netlify/functions/` | Stripe, licensing, support tickets, admin API |
| `docs/NETLIFY-SETUP.md` | Deploy checklist + env vars |

## Key URLs (production)

| URL | Purpose |
|-----|---------|
| `/` | Marketing + buy ($399) |
| `/help/` | Setup & troubleshooting |
| `/support.html` | Support ticket form |
| `/admin/` | Operator portal (licenses, tickets, comp keys) |
| `/api/activate` | App license activation (per-machine bind) |

## Deploy

1. Connect this repo to Netlify
2. Base directory: **repo root** (publish = `public`)
3. Set env vars — see `docs/NETLIFY-SETUP.md` and `.env.example`
4. Custom domain: **specter-imaging.com**

## Email

All mail from **support@specter-imaging.com** via **Brevo** (`BREVO_API_KEY`). Keep Brevo IP authorization **OFF** (Netlify uses dynamic IPs).
