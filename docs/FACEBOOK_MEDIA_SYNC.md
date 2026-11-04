# Facebook media synchronization — Anh Khôi AI Media

## Data flow

The existing Cloudflare Browser Rendering worker discovers **public** Facebook links.
D1 stores items, captions, source URLs, media dimensions, and optional image records.
R2 stores publicly retrievable thumbnails and album images when downloads succeed.
Pages Functions expose a paginated feed. The Astro frontend displays every item
currently available in the database, including full known captions and
uncropped image thumbnails.

- `/facebook/` — all synchronized public posts, photos, videos and Reels
- `/reels/` — videos and Reels only
- `/api/feed?limit=24&offset=0` — public feed pagination
- `/api/reels?limit=24&offset=0` — video pagination

Video embeds use the official public Facebook video plugin in a responsive
player. Reels default to 9:16; videos default to 16:9; available original
metadata takes precedence. Facebook controls whether a particular embed can
actually play. If not, the original permalink is shown. Native local playback
of every Facebook video is **not** guaranteed by public embeds.

## Important limitations

Facebook may require login, hide full captions/media or prevent public embeds.
The crawler does **not** use login cookies, bypass restrictions or use the Meta
Graph API. Therefore it cannot guarantee every historical post, Story, full
album or caption will be collected. The user interface must not silently invent
missing captions. Items already in D1 remain intact.

## Release procedure

Changes are proposed on a feature branch. Do not force-push, reset production
data, or automatically enable deployment.

1. Review the pull request and run `node --test tests/facebook-sync.test.mjs`.
2. Run `pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm build`.
3. Merge the validated frontend/API changes; confirm the Cloudflare Pages
   release strategy before deploying.
4. Deploy the updated `workers/facebook-sync/worker.js` **separately** with
   the existing `BROWSER`, `DB` and `MEDIA` bindings and scheduled triggers.
5. Observe `sync_runs`/`sync_errors`, then inspect `/api/feed`, `/api/reels`,
   `/facebook/` and `/reels/` on desktop/mobile.
6. Verify real Facebook public video playback in a private browser session.
   If Facebook rejects a player, the original Facebook link remains available.

No schema migration is required; existing `facebook_media` and
`facebook_items.raw_json` fields are reused.
