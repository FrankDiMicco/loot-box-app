# iOS App Store Roadmap — Loot Box Creator

Path from "web app on GitHub Pages" to "app on the App Store." Phases are
ordered by dependency: each one unblocks the next. Detailed feature notes
live in TODO.md ("Capacitor / iOS App Store"); this file is the sequence,
the gates, and the costs.

**The one hard external gate: iOS builds require Xcode on macOS.** Dev
machine here is Windows, so Phase 1 starts with a Mac-access decision.
Everything in Phase 0 can be done on Windows today.

---

## Phase 0 — Foundations (all doable now, on Windows)

Work that must land BEFORE wrapping, because retrofitting it inside a
native shell is strictly harder.

1. **Vite precompile** (TODO High priority #1). Today every launch ships
   ~1MB of Babel and compiles 7,500 lines of JSX in the browser. In a
   WKWebView that's a slow cold start on every app open — and App Review
   notices sluggish launches. A real build (static JS, code-split, `createRoot`)
   is effectively a prerequisite, and Capacitor's tooling assumes a `dist/`
   folder anyway. *This is the single biggest work item in the roadmap.*
2. **Firebase Anonymous Auth** (TODO #4). The device ID lives in
   localStorage; in a native app users expect identity to survive
   reinstall (Keychain-backed). Anonymous Auth + `creatorUid` on boxes is
   the foundation, and it also unlocks the deferred `boxCatalog` write
   lockdown (TODO #8) and tighter `sharedBoxes` rules.
3. **App Check enforcement** (TODO #7, remaining piece). A store app puts
   the Firebase config in many more hands. Wire reCAPTCHA v3 (web) now;
   the Capacitor app later uses App Check with DeviceCheck/App Attest.
4. **Real app icon / logo** (Cleanups list). The App Store requires a
   1024×1024 marketing icon plus the full icon set. The current text-only
   wordmark stopgap won't cut it — this becomes *blocking* at Phase 3, so
   commission/design it early. Also fixes the boot splash.

Exit criteria: built app (no Babel at runtime), anonymous auth live,
App Check enforced, real icon assets in hand.

## Phase 1 — Toolchain + Capacitor shell

1. **Decide Mac access** (pick one):
   - **Used/refurb Mac mini** (~$300–500 one-time): full control, local
     debugging on a real device. Best if iOS is a serious direction.
   - **Cloud Mac** (MacinCloud etc., ~$25–50/mo): no hardware, clunkier
     iteration loop.
   - **CI-only (Codemagic / GitHub Actions macOS runners)**: build, sign,
     and upload from CI without touching a Mac. Cheapest start, but
     debugging native issues without Xcode is painful. Fine for the wrap;
     limiting once native plugins land.
   - Recommendation: start CI-only for the shell; buy a Mac mini the first
     time a native bug needs a debugger.
2. **Apple Developer Program** — $99/yr. Enroll early; also needed for
   TestFlight. Enroll in the **Small Business Program** (15% IAP cut)
   whenever monetization ships.
3. **Capacitor wrap**: `npm i @capacitor/core @capacitor/cli`,
   `npx cap init`, `npx cap add ios`, point `webDir` at the Vite `dist/`.
   `normalizeAssetPath` in index.html already anticipates non-root asset
   paths. Verify: app boots in the iOS Simulator, Firebase works, opening
   flow + sounds + share links function inside WKWebView.
4. **Web keeps working**: the same build must still deploy to GitHub
   Pages. One codebase, two targets — platform-gate native calls behind
   `Capacitor.isNativePlatform()`.

Exit criteria: the app runs on an iPhone (device or simulator) from a
signed build.

## Phase 2 — Native features (the Guideline 4.2 defense)

Apple rejects thin web wrappers ("your app is just a website"). These are
the v1 native features — each is a Capacitor plugin over code that already
exists (details in TODO.md):

1. **Local notifications for recharge timers** — `@capacitor/local-notifications`
   over `getTimeUntilNextRecharge`. No server needed. The retention feature.
2. **Real haptics** — `@capacitor/haptics` mapped to the existing
   `triggerHaptic` tier patterns (currently Android-only via `navigator.vibrate`).
   The charge/open ceremony is where this shines.
3. **QR code scanning** to join boxes (app only generates QR today).
4. **Universal Links** — box links open the app. Requires an
   `apple-app-site-association` file at `/.well-known/` on the Pages
   domain (GitHub Pages serves this fine) + Associated Domains entitlement.
5. *(Optional, can ship post-launch)* **Push via APNs** — drops the web's
   Home-Screen-install requirement. Needs the Cloud Functions setup from
   TODO #6; don't block launch on it.

Defer the v2 wow tier (App Clips, widgets, Game Center) until after launch.

Exit criteria: at least items 1–2 (ideally 1–4) working on device. That
is a credible 4.2 answer: native notifications, haptics, camera, deep links.

## Phase 3 — Store readiness

1. **Privacy policy** (required) — a page on the Pages site. Covers:
   anonymous auth ID, display names, pull history stored in Firestore,
   no ads/tracking/sale of data.
2. **App Privacy labels** in App Store Connect — declare Firestore data
   (identifiers, user content). No account creation = the account-deletion
   rule is light, but expose a "delete my data" path anyway (deleting the
   anon user + their boxes) — reviewers increasingly ask.
3. **Review-notes preemption**: the app is named "Loot Box Creator" —
   preempt a gambling flag in the notes. No real money, no purchases (at
   v1), user-created boxes for parties/decisions, odds always displayed
   (which already satisfies Apple's published-odds rule if paid random
   items ever exist). Age rating: fine at 4+/9+ since users create content.
4. **Listing assets**: screenshots (6.7" + 5.5" sets), description,
   keywords, the Phase-0 icon.
5. **TestFlight beta** with the current friends-scale users — this is the
   real QA pass, and external TestFlight itself goes through a light review
   (an early warning of 4.2 trouble before the real submission).

Exit criteria: TestFlight build approved and friends using it.

## Phase 4 — Submission

1. Submit for review with the notes from Phase 3.
2. Expect 1–3 days per review cycle; plan for one rejection round
   (most common first-submission outcomes here: 4.2 thin-wrapper, privacy
   label mismatch, or a crash on iPad — test iPad layout even though the
   app is phone-first).
3. After approval: keep GitHub Pages as the always-current web version;
   ship App Store updates on a slower cadence (each needs review).

## Phase 5 — Later (post-traction, per the monetization decision)

- One-time Pro unlock via **Apple IAP** (mandatory for digital goods;
  15% under Small Business Program). Web version can sell the same unlock
  via Stripe with no cut. NO subscriptions — decided July 2026.
- Push notifications if not shipped in Phase 2.
- v2 native tier: App Clips, widgets/Live Activities, Game Center.

---

## Costs

| Item | Cost |
|---|---|
| Apple Developer Program | $99/yr (required) |
| Mac access | $0 (CI free tier) → ~$400 one-time (Mac mini) |
| Everything else | already paid (Firebase Blaze, domain-free via Pages) |

## Order of work, compressed

Vite build → Anonymous Auth → App Check → icon/logo → Mac decision +
dev account → Capacitor shell → notifications + haptics (+ QR, links) →
privacy policy + labels → TestFlight → submit.

The first two items are the long poles and are pure web work — everything
iOS-specific after them is comparatively small.
