# Loot Box Creator — TODO / Next Steps

Working backlog for future sessions. Items include enough context to start cold.
When an item ships, delete it from this file (git history keeps the record).

App: single-file React app in `index.html` (~7,500 lines, JSX compiled in-browser
by Babel Standalone). Hosted on GitHub Pages (push to `main` = deploy).
Backend: Firebase project `lootbox-app-dd5fa` (Firestore + Storage, Blaze plan).
Canonical security rules: `firestore.rules` (deploy manually via Firebase console).

---

## High priority

### 1. Precompile with Vite (biggest structural win)
Every visitor downloads ~1MB of Babel and compiles 7,500 lines of JSX on their
phone at page load. Move to a Vite build: split `index.html` into modules
(components / firebase services / utils), output static JS, deploy the build to
GitHub Pages (e.g. via Actions). Also switch deprecated `ReactDOM.render` to
`createRoot`. Most other items get easier after this one.

### 2. Accessibility pass (scoped in detail, mostly mechanical)
- `ToggleSwitch` (Settings) is a click-only div → `<button role="switch" aria-checked>`
- Collapsible headers (Current Odds, Open History, Show Advanced) are divs → buttons with `aria-expanded`
- `aria-label` on icon-only buttons: hamburger, favorite star, share, ⋮ menu, toast ×
- Escape closes all dialogs (delete confirms, QR, About, template import); move focus into dialog on open, back to trigger on close, `role="dialog"`
- Remove `user-scalable=no, maximum-scale=1` from the viewport meta (blocks pinch-zoom)
- Nudge lowest-contrast grays (`#64748b` on dark) up a shade for timestamps/hints
Already good: reduced-motion support, `:focus-visible`, keyboard-operable chest.

### 3. Image size (24 MB of catalog PNGs)
Catalog images are 1.6–2.6 MB each, displayed at ~200px. Two parts:
- One-time: resize/convert existing images to ~400px WebP, upload, update
  `imageUrl` in `boxCatalog` Firestore docs. Local backups of all 13 originals
  are in `assets/images/boxes/catalog-backup/`.
- Ongoing: auto-compress in `box-admin.html` at upload time (canvas resize →
  WebP blob before Firebase Storage upload), so future boxes are small
  automatically. User adds boxes regularly — this is the part that matters.

---

## Scale / security (needed before wide sharing; fine to defer for friends-scale)

### 4. Firebase Anonymous Auth + tightened rules
No auth today; device IDs are self-issued and spoofable. Anyone who knows a
shareCode can delete any shared box (`allow delete: if true` — unavoidable
without auth), and `boxCatalog` is world-writable because `box-admin.html`
writes from the browser unauthenticated. Plan: enable Anonymous Auth (SDK
already loaded in index.html), store `creatorUid` on boxes, rules check
`request.auth.uid`, lock `boxCatalog` writes behind an admin UID list.

### 5. Pulls subcollection (removes the 1MB ceiling)
`pullHistory` is one ever-growing array on the `sharedBoxes` doc. Firestore
caps docs at 1MB (~2–3k pulls) and ~1 write/sec/doc. Move pulls to a
`sharedBoxes/{code}/pulls` subcollection + counters on the parent doc.
Migration must handle existing boxes. Touches: transaction in
`addPullToSharedBox`, listeners, history UI, stats.

### 6. Server-authoritative opening (Cloud Function)
The item is chosen by `Math.random()` in the browser — a motivated user can
award themselves anything. A callable Cloud Function (`openBox`) should pick
the item, enforce all limits (including recharge, which the transaction
currently does NOT check server-side), and write the pull. Solves recharge
race across devices too. Requires Blaze (already on it).

---

## Cleanups (small, do opportunistically)

- Delete `set-premium.html` (sets a `tier` field nothing reads)
- Delete the 3 placeholder `boxCatalog` docs with `source: "store"` and
  `via.placeholder.com` URLs (Ancient Relic, Cyber Elite Box, Golden Treasure)
- Remove unused SDK script tags in index.html: `firebase-auth-compat` (until
  item 4), `firebase-storage-compat` (app never uses Storage directly)
- `loadData` re-fetches every shared box on each visit to home AND `App` +
  `BoxOpener` both subscribe to the open box (duplicate listeners) — let the
  App-level subscription be the single source
- `BoxCard` reads localStorage (`getLastSeenPullCounts`, `getDeviceId`) during
  render, re-parsed on every 30s tick — cache device ID in a module constant,
  memoize the rest
- `StatsScreen` uses raw `window.innerWidth` instead of the `useIsMobile` hook;
  its Total Opens / Luck Score include OTHER people's pulls on shared boxes —
  filter by `deviceId === getDeviceId()`
- `project-summary.txt` is stale (says "~4000 lines", premium tiers, missing
  recent features) — refresh or fold into README

---

## Ideas / nice-to-have

- Service worker → true offline PWA + install prompt on older Android
  (manifest + icons already done)
- Sound tuning: opening SFX is fully synthesized (see `playBuildUpSound` /
  `playRevealSound` / `playRareSound`); all envelopes/frequencies are
  parameterized. If synthesis isn't cutting it, switch to CC0 samples
  (e.g. Kenney audio packs): chest creak, orchestral hit, coin shower
- Notification/activity feed (new pulls on your shared boxes since last visit —
  the per-box blue dot exists; a global view doesn't)
- Export/import boxes as JSON backup
- Analytics dashboard for creators (pull stats per box, charts)
- Social: favorites exist; leaderboards/achievements do not

---

## Session workflow notes

- Verify changes in the browser preview before committing (drive the actual
  flow; localStorage-injected test boxes work well — clean up after)
- Shared-box tests write to production Firestore — delete test docs afterward
- Commit + push per completed batch; push = live deploy via GitHub Pages
- Firestore rules do NOT deploy from the repo — paste `firestore.rules` into
  the Firebase console manually after changing it
