
# Anh Khoi Facebook Sync Worker

This Worker is deliberately isolated from the Fuwari/Astro site.

- Reads only public Facebook pages through a Cloudflare Browser Run binding.
- Does not use Meta/Facebook API credentials.
- Does not store Facebook login cookies or attempt to bypass login walls/CAPTCHAs.
- Writes discoveries to D1 and caches eligible public thumbnails in R2.
- Runs in shadow mode by default. Public feed remains disabled until explicitly enabled.
- Cron is configured separately in Cloudflare.

Bindings:
- BROWSER: Browser Run
- DB: D1 database \`anhkhoi-content\`
- MEDIA: R2 bucket \`anhkhoi-media\`
