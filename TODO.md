# Loot Box Creator — TODO / Next Steps

Working backlog for future sessions. Items include enough context to start cold.
When an item ships, delete it from this file (git history keeps the record).

App: single-file React app in `index.html` (~7,500 lines, JSX compiled in-browser
by Babel Standalone). Hosted on GitHub Pages (push to `main` = deploy).
Backend: Firebase project `lootbox-app-dd5fa` (Firestore + Storage, Blaze plan).
Canonical security rules: `firestore.rules` (deploy manually via Firebase console).

---

## High priority

### 1. Precompile with Vite — SHIPPED July 2026
The app is now a Vite build: `src/main.jsx` + modules under
`src/components/`, `src/lib/`, `src/services/`; static files in `public/`;
`createRoot` instead of `ReactDOM.render`; GitHub Actions builds and
deploys `dist/` to Pages on push (`.github/workflows/deploy.yml`).
ESLint (`no-undef`, `no-import-assign`, `react/jsx-no-undef`) guards the
module boundaries — run `npx eslint src` after moving code between files.
Firebase + QRCode remain CDN globals (candidates to move to npm later).
App: single-file React app in `index.html` → now see `src/`.

### 2. Accessibility pass (scoped in detail, mostly mechanical)
- `ToggleSwitch` (Settings) is a click-only div → `<button role="switch" aria-checked>`
- Collapsible headers (Current Odds, Open History, Show Advanced) are divs → buttons with `aria-expanded`
- `aria-label` on icon-only buttons: hamburger, favorite star, share, ⋮ menu, toast ×
- Escape closes all dialogs (delete confirms, QR, About, template import); move focus into dialog on open, back to trigger on close, `role="dialog"`
- Remove `user-scalable=no, maximum-scale=1` from the viewport meta (blocks pinch-zoom)
- Nudge lowest-contrast grays (`#64748b` on dark) up a shade for timestamps/hints
Already good: reduced-motion support, `:focus-visible`, keyboard-operable chest.

---

## Scale / security (needed before wide sharing; fine to defer for friends-scale)

### 4. Firebase Anonymous Auth — FULLY SHIPPED July 19, 2026 (incl. item 8)
Provider enabled; app signs in at boot (`ensureSignedIn`); shared
boxes/templates carry `creatorUid`; legacy boxes auto-claimed by their
creator's device (`backfillCreatorUid`). Auth-aware rules DEPLOYED and
probe-verified (14/14): writes require sign-in, edits/deletes are
creator-or-admin, ownership can't be reassigned, `boxCatalog` writes
locked to the admin allowlist. Admin uids come from the headers of
box-admin.html (file:// origin) and shared-box-cleanup.html (Pages
origin) — clearing browser site data issues a NEW uid; if admin writes
start failing with permission-denied, re-grab the uid and update the
allowlist in `firestore.rules` + console.

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
race across devices too. Requires Blaze (already on it). Also the only real
path to rate limiting (rules can't count requests).

### 7. Cost-abuse safeguards (denial-of-wallet)
Blaze has no spending ceiling and the Firebase config is public in the page
source — a bot can bill us directly. Layers, in bang-for-buck order:
- Budget alerts at $5 / $25 / $100 (Cloud console → Billing → Budgets).
  IMPORTANT: alerts only EMAIL — they do not stop spending.
- Hard cap (optional): budget → Pub/Sub → small Cloud Function that detaches
  billing at a threshold (documented Google pattern). Manual emergency brake:
  detach billing in the console — app goes down, damage stops.
- Firebase App Check with reCAPTCHA v3 — biggest single win; blocks scripted
  abuse of the public config. Console: register app, get reCAPTCHA key;
  add App Check SDK init to index.html; then turn on ENFORCEMENT for
  Firestore and Storage (grace period first to avoid locking real users out).
- Rules hardening in `firestore.rules`: make pullHistory updates append-only
  (size can only grow by 1) with a hard cap (~2000); enforce doc IDs match
  `[A-Z0-9]{6}` on create; set `boxCatalog` write to false — NOTE this breaks
  box-admin.html until it gets auth; manage the catalog via the Firebase
  console in the interim.
- `storage.rules` written (box-catalog path + image type + 2MB cap, still
  unauthenticated); deploy in console and tighten to require auth once the
  admin page has login. NOTE: default test-mode Storage rules expire after
  30 days — that is why catalog uploads started failing with
  storage/unauthorized.
- Shared-box ephemerality (see Monetization direction below) also bounds
  storage costs permanently.

---

## Cleanups (small, do opportunistically)

- **Header logo needs a real, professional design.** Current state is a
  text-only gradient wordmark ("LOOT BOX" + "CREATOR" tag) in the `Header`
  component in `index.html` — a stopgap after removing the raster chest photo
  and a code-drawn cube mark, neither of which looked good. This needs an
  actual designed logo/mark (designer or a proper asset), not another
  code-generated attempt. There's also a matching logo on the boot splash
  (`.boot-screen`, still the old `logo-chest.png`) to update in tandem.
- The 3 `source: "store"` placeholder docs (Ancient Relic, Cyber Elite Box,
  Golden Treasure — `via.placeholder.com` art, fake $0.99/$1.99/$2.99 prices)
  are now DEACTIVATED (`active: false`), so they're hidden from the app.
  Optional remaining step: hard-delete them via box-admin's Delete button
  (must be done from Frank's admin browser — catalog writes are allowlisted).
  Decision: no paid box store — user-uploaded boxes make it redundant.
- `loadData` re-fetches every shared box on each visit to home AND `App` +
  `BoxOpener` both subscribe to the open box (duplicate listeners) — let the
  App-level subscription be the single source
- `project-summary.txt` is stale (says "~4000 lines", premium tiers, missing
  recent features) — refresh or fold into README

---

## Fun factor (ranked by fun-per-effort; party feed + discovery log shipped July 2026)

- **Golden opens** — every ~50th open randomly upgrades: chest turns gold
  mid-shake, odds visibly double, extra FX. Pure animation/sound layer.
- **Hold-to-charge opening** — press-and-hold instead of tap; chest rattles
  and glows harder the longer you hold. Doesn't change odds, feels like it.
- **Reactions** — tap a small reaction on someone's pull in history
  (store on the pull entry). Group-chat energy, tiny data.
- **Secret Santa mode** — names on pulls hidden until everyone has pulled,
  then one big reveal. Fits gift exchanges; expiration + per-person limits
  already support the use case.
- **Shareable luck card** — render a pull as an image via canvas (item,
  odds, box name, chest art) and share the image. Markets the app better
  than a text link.
- **Quick-create from a list** — paste "pizza, sushi, tacos" → box with even
  odds in two taps. Unlocks the decision-wheel crowd.
- **Advent calendar mode** — recharge system (1/day, limited cycles) is 90%
  of this; add a fixed-sequence option.
- **Near-miss theater** — flash the rare item's color for a frame before a
  common lands. Very effective, ethically spicy — fine for a free
  friends app, revisit if money ever gets involved.

## Ideas / nice-to-have

### Push notifications ("someone opened your box!")
Works on iOS since 16.4 — but ONLY for users who added the app to their Home
Screen (manifest + icons already shipped). Android works everywhere. Plan:
1. Service worker (also unlocks offline PWA — see next item)
2. Firebase Cloud Messaging for web push (fits the existing stack): generate
   VAPID key in Firebase console, request permission from a user gesture
   (e.g. a "Notify me" toggle on shared boxes — never on page load),
   store FCM tokens per device on the shared box doc
3. Cloud Function triggered on new pulls → push to the box creator /
   subscribed participants (requires the Functions setup from the
   "server-authoritative opening" item; can share it)
Related iOS limitation, for the record: real haptics are impossible in a web
app — iOS Safari has no `navigator.vibrate`, so `triggerHaptic()` is
Android-only today. Options: the iOS 17.4+ checkbox-switch hack (single tick
on button taps only) or wrapping the app in Capacitor for the native Haptics
API (a `normalizeAssetPath` comment suggests Capacitor was already considered).

- Service worker → true offline PWA + install prompt on older Android
  (manifest + icons already done; also required for push, above)
- Sound tuning: opening SFX is fully synthesized (see `playBuildUpSound` /
  `playRevealSound` / `playRareSound`); all envelopes/frequencies are
  parameterized. If synthesis isn't cutting it, switch to CC0 samples
  (e.g. Kenney audio packs): chest creak, orchestral hit, coin shower
- Notification/activity feed (new pulls on your shared boxes since last visit —
  the per-box blue dot exists; a global view doesn't)
- Export/import boxes as JSON backup
- Analytics dashboard for creators (pull stats per box, charts)
- Social: favorites exist; leaderboards/achievements do not

### Box search keywords — SHIPPED July 2026
box-admin.html now has a comma-separated "Search Keywords" field (stored as a
lowercased array on the boxCatalog doc); the picker search already matched
that array. All 15 real catalog boxes were tagged directly in Firestore
(the 3 store placeholders were skipped, then deactivated). Add keywords to
any new box via the admin form. Note: picker search is scoped to the active
tab, so a seasonal box's keywords only surface under the Seasonal tab.

### Custom photo uploads (items + boxes) SHIPPED July 2026
Users attach their own photos to both ITEMS and the BOX image. Compressed
client-side to WebP data URIs (items ~160px/~8KB; box ~400px/~50KB), no
Firebase Storage. Pulls reference items by id (resolveItemImage). Shared
boxes: images live in sibling doc sharedBoxes/{code}/meta/images — items
keyed by itemId, the box photo under key `boxCover` (NOT double-underscore;
Firestore reserves __names__). meta rule in firestore.rules is DEPLOYED.
No-loss inline fallback if the meta write ever fails. loadData + the App
realtime subscription preserve a locally-known boxImageId so cards don't
blank when the stripped snapshot omits it. Still open:
- **Curated item icon pack** — the picker UI exists; this just needs 40–60
  consistent-style icons shipped as repo assets, added as pre-made entries.
  Needs art generated first; then it's trivial (same as box-skin catalog).
  (A "curated box skin pack" is the same idea for box images.)
- Consider IndexedDB if localStorage (~5MB) ever pinches for photo-heavy
  users; today a failed save surfaces an inline error instead of losing data.
- Custom images are a natural candidate to gate behind the one-time Pro
  unlock (see Monetization direction).

### Capacitor / iOS App Store (future direction)
**Full phased plan lives in `ROADMAP-IOS.md`** (added July 2026) — sequence,
gates (Mac access, $99/yr dev account), costs, and store-compliance steps.
This section holds the feature-level detail that roadmap references.
Wrap the existing app in Capacitor (a `normalizeAssetPath` comment shows this
was anticipated). Native features are also what passes App Store guideline
4.2 (thin web wrappers get rejected).
v1 candidates (straightforward plugins over existing code):
- Local notifications for recharge timers — no server needed, the countdown
  math already exists (`getTimeUntilNextRecharge`); the retention feature
- Real haptics via Core Haptics mapped to the existing tier patterns
  (`triggerHaptic` uses navigator.vibrate = Android-only today)
- QR code SCANNING to join boxes (we only generate QR today)
- Universal Links so box links open in the app
- Push via APNs (drops the web's Home-Screen-install requirement)
v2 / wow tier (extra native work beyond base Capacitor):
- App Clips: tap a shared box link → instant no-install mini app
- Widgets / Live Activities: recharge countdowns on the home screen
- Game Center: leaderboards/achievements
- Keychain/iCloud identity: device ID currently dies with localStorage;
  pairs with the Anonymous Auth item
Store notes: digital purchases must use Apple IAP (15% under Small Business
Program; web version can sell via Stripe with no cut). If paid random boxes
ever exist, Apple requires published odds — the app already shows odds.
Privacy policy required for submission.

### Monetization direction (decided July 2026: NO subscriptions)
Frank hates subscription apps; one-time purchases are acceptable. The
economics support this: bounded per-user cost is cents over a lifetime.
- Free-forever core: unlimited LOCAL boxes (they're localStorage — zero
  backend cost) + a few active shared boxes
- One-time Pro unlock ($3–5): more/unlimited active shared boxes, all
  skins, full stats
- Optional one-time seasonal cosmetic packs (skins/effects/sounds) — the
  catalog + seasonal system already supports this; recurring revenue
  without ever charging rent
- Make shared boxes ephemeral by default (auto-archive after ~90 days
  inactivity via Firestore TTL) — bounds storage forever and fits the
  use case (party/event boxes)
- Do NOT build any of this until the product has traction; costs round
  to zero at current scale

---

## Session workflow notes

- Verify changes in the browser preview before committing (drive the actual
  flow; localStorage-injected test boxes work well — clean up after)
- Shared-box tests write to production Firestore — delete test docs afterward
- Commit + push per completed batch; push = live deploy via GitHub Pages
- Firestore rules do NOT deploy from the repo — paste `firestore.rules` into
  the Firebase console manually after changing it
