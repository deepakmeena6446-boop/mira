# Mira — Phase 4: beyond the browser

Branch `ux/phase4`, stacked on `ux/phase3`. It is not merged and not pushed. Phase 4 covers what makes Mira dependable when the screen is off and closes the contributor loop. Anything that needs an outside account, store or service is a **placeholder**: wired, documented and honest, never pretending to work.

## 1. Native shell and background location — placeholder seam

- **Today:** Mira is an installable PWA (manifest, service worker, *Install Mira* in You). On a journey, the browser can pause location when the phone locks. The journey screen and the follower page already say this ("Location paused… often it just means the phone screen is off").
- **The seam:** `src/lib/native-bridge.ts`. A native shell (for example a Capacitor iOS/Android wrapper) injects `window.MiraNative` with:
  - `available.backgroundLocation`
  - `startBackgroundLocation(journeyId, uploadUrl)`
  - `stopBackgroundLocation(journeyId)`

  A half-injected shell is ignored. Unit tested: `tests/unit/native-bridge.test.ts`.
- **Needed, and external:**
  - an Apple developer account and a Google Play console
  - the iOS *Always* / Android background location permission text, and store review
  - the OS location indicator
  - the shell itself, which posts the position to the existing `/api/trips/:id/location`
- **Rule:** nothing in Mira may claim background tracking until `available.backgroundLocation` is true.

## 2. Notifications that close the loop

- **Contributors hear when others agree.** When something a person added (a Mira Check answer, a correction, a lighting vote) is confirmed by someone else, Updates gets one calm item per run, for example "2 things you added were confirmed — thank you." It links to Contribute.
  - The worker job records `notified_at`, so it never repeats.
  - Migration `0025` is additive.
  - Only counted, verified receipts qualify. Nothing about what or where is in the text.
- Urgent kinds keep using web push (missed check-in, alert failed, location paused, contact accepted). Confirmations are in-app only, on purpose: they are never urgent.
- **Needed, and external:** push on iOS needs the installed PWA (iOS 16.4+) or the native shell. VAPID keys already exist.

## 3. WhatsApp — tap-to-send now, Business API placeholder

- **Today:** for a WhatsApp contact, Mira opens WhatsApp with the live link and **the person presses Send**. Mira records "opened WhatsApp", never "delivered".
- **The seam:** `src/server/providers/whatsapp/index.ts`.
  - `whatsappMode()` returns `tap_to_send` until an adapter is implemented **and** `WHATSAPP_BUSINESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_TEMPLATE_LIVE_LINK` are set (documented in `.env.example`).
  - `providerModes().whatsapp` exposes the mode.
- **Needed, and external:**
  - a verified WhatsApp Business account
  - an approved utility template ("{{traveller}} shared their journey with you: {{link}}")
  - opt-in wording for contacts
  - a decision on missed-check-in messages: they need a separate approved template and must stay "accepted by WhatsApp", never "seen"

## What Phase 4 does not change

The default stays the same everywhere:
- "Just me" sharing
- receipts, never guesses
- no location history
- emergency services are always the phone's own
