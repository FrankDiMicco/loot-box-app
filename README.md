# Loot Box Creator

A mobile-first web app for creating and opening custom loot boxes — for
parties, gift exchanges, decisions, or fun. Users define items and odds,
open boxes with a charged-up chest animation (synthesized audio, no sound
files), and share boxes with friends via link/QR for real-time group
opening with a live party feed.

**Live:** https://frankdimicco.github.io/loot-box-app/

## Architecture

- **Frontend:** React 18 + Vite. Source in `src/` (`main.jsx` bootstraps;
  components in `src/components/`, utilities in `src/lib/`, Firebase and
  audio services in `src/services/`). Static assets in `public/`.
  Firebase compat + QRCode load as CDN globals from `index.html`.
  An installable, offline-capable PWA: `vite-plugin-pwa` generates a service
  worker at build time that precaches the app shell (and runtime-caches fonts
  and the CDN libs), so the app boots and opens local boxes with no network.
  Firestore calls are never intercepted — they always hit the network.
- **Backend:** Firebase project `lootbox-app-dd5fa` — Firestore for shared
  boxes/templates/catalog, Anonymous Auth for identity. Local boxes live
  entirely in localStorage and work offline. The app never uses Cloud
  Storage (user photos are compressed WebP data URIs in Firestore).
- **Security:** every visitor is an anonymous Firebase user; shared boxes
  carry `creatorUid` and Firestore rules (`firestore.rules`) enforce
  creator-only edits/deletes, append-only pull history, and an
  admin-allowlisted box catalog.

## Development

```
npm install
npm run dev       # Vite dev server on :5173
npm run build     # production build to dist/
npm run preview   # serve the built app on :4173 (test the service worker here)
npm run optimize:images  # re-compress bundled art after adding any (see scripts/)
npx eslint src    # no-undef / no-import-assign / jsx-no-undef guard the
                  # module boundaries — run after moving code between files
```

## Deployment

Push to `main` → GitHub Actions builds and publishes `dist/` to GitHub
Pages (`.github/workflows/deploy.yml`). A broken build blocks the deploy.

**Firestore rules do NOT deploy from the repo** — after editing
`firestore.rules`, paste it into the Firebase console (Firestore → Rules)
manually. Same for `storage.rules` (Storage → Rules).

## Admin tools

- `box-admin.html` — box-image catalog manager. Local-only (gitignored,
  never deployed); open it from disk. Writes require its uid to be in the
  rules' admin allowlist (shown in the page header).
- `public/shared-box-cleanup.html` — deployed alongside the app; scans for
  abandoned shared boxes and deletes them after review. Admin mode +
  idle threshold control the sweep; deletion is always manual.

## Project docs

- `TODO.md` — the working backlog (kept current; shipped items deleted)
- `ROADMAP-IOS.md` — phased plan for an iOS App Store release
