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

### Box search keywords (picker shipped July 2026; search works on names now)
The image picker is a modal sheet with search that already matches a
`keywords` array on catalog docs — but no docs have one yet. To make search
rich: add a comma-separated "Keywords" field to box-admin.html's add/edit
form (store as array on the boxCatalog doc), then tag the existing 14 boxes
(e.g. skull → "pirate, spooky, halloween"). Zero app changes needed.

### Item images (decided: no emoji — cheapens the look; no Firebase Storage)
Two phases, zero/near-zero backend cost:

**Phase 1 — curated item icon pack (do first).** 40–60 icons in a consistent
style matching the chest art (weapons, potions, gems, gifts, food, tickets,
money…), shipped as repo assets on GitHub Pages (free). Items store an icon
id. Same pattern as the box-skin catalog, guarantees the designed look, no
compression pipeline needed. Add a picker to ItemCreator (items already
support `imageUrl`; there is just no picker UI).

**Phase 2 — custom user images (candidate Pro feature).** User photos,
compressed client-side and embedded as base64 data URIs — Firebase Storage
never involved:
- Canvas pipeline: crop square → downscale ~128px → WebP/JPEG q≈0.6 →
  target 4–12KB per image
- Local boxes: data URIs live in localStorage with the box (~5MB quota =
  dozens of image-boxes; consider IndexedDB if that ever pinches)
- Shared boxes: Firestore doc storage cost is pennies, BUT two required
  design decisions or it blows up:
  1. PULLS MUST STORE itemId ONLY, not a copied imageUrl — today every pull
     copies `imageUrl` into pullHistory; with data URIs each open would
     duplicate the whole image and hit the 1MB doc cap in dozens of pulls.
     (This refactor is worth doing in Phase 1 anyway.) UI resolves images
     by looking up the item; mind hideContents when resolving for others.
  2. Images live in a sibling doc (`sharedBoxes/{code}/meta/images`),
     fetched once and cached — NOT the main box doc, which realtime
     listeners re-send in full to every participant on every pull.

### Capacitor / iOS App Store (future direction)
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
