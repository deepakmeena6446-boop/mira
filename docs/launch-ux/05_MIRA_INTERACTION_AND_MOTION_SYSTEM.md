# 05 — Mira Interaction and Motion System

**Rule zero.** Motion communicates **state or continuity**. If an animation can't be justified in one sentence of the form *"this tells the user that ___"*, it is removed. (C-2.4, and 03 §0.1 #15.)

**Implementation constraint:**
- **No motion library.** CSS transitions and keyframes, `@starting-style`, `transition-behavior: allow-discrete`, `linear()` easing, and MapLibre's own camera animations cover everything below (03 Part 3 §3: all of these are Baseline in Chrome, Safari and Firefox in 2026).
- React `<ViewTransition>` and the View Transitions API are **CONSIDER LATER**. They are not needed for launch.

---

## 1. Motion tokens (add to `globals.css` `@theme` / `:root`)

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default for things appearing or responding |
| `--ease-in` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | Things leaving (exits are faster) |
| `--ease-sheet` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheet snaps (the iOS-like curve) |
| `--ease-linear` | `linear` | Continuous rotation (thinking arc) only |
| `--dur-press` | 100 ms | Press feedback |
| `--dur-state` | 180 ms | Toggles, chips, segmented thumb, colour changes |
| `--dur-enter` | 240 ms | Cards, banners, toasts entering |
| `--dur-exit` | 160 ms | Anything leaving |
| `--dur-overlay` | 280 ms | Modal sheets, search overlay |
| `--dur-sheet` | 380 ms | Bottom sheet snap |
| `--dur-map` | 600 ms | Camera fits (KEEP the existing 600–700 ms) |
| `--dur-breath` | 3200 ms | The `with-you` presence breath (the only ambient loop) |

Rules:
- UI motion ≤ 300 ms except the sheet (380), the map (600) and the one ambient breath.
- Animate `transform` and `opacity` only. The existing sheet animates `height`, which is acceptable until the optional Phase 9 refactor (04 §14).
- **Never** start from `scale(0)`. Minimum 0.96.
- **No overshoot or bounce** in UI (REPLACE the current `rise` curve `cubic-bezier(0.2,0.9,0.3,1.2)`).
- Exits are faster than entrances.

## 2. Reduced motion (global policy)
- KEEP the global `prefers-reduced-motion: reduce` kill switch in `globals.css` as the safety net.
- In addition, every component defines its **reduced alternative**, listed per item below. Crossfades (opacity ≤ 120 ms) remain allowed. Positional movement, scaling, rotation, ripples and breathing do not.
- The map: under reduced motion, pass `duration: 0` to `fitBounds`/`easeTo` (a `prefersReducedMotion()` check in `WorldMap`).
- **Haptics are independent of reduced motion.** They follow the user's setting (a post-launch toggle). Android only, via `navigator.vibrate?.()` with feature detection. They are never the only signal.

---

## 3. Mira Pulse (presence) — the signature behaviour

The Pulse is the answer to "how does Mira show it's present?". The research rejected a glowing orb (03 Part 2 §2.4). The chosen interpretation is:

**Presence is shown through the user's own position and one quiet mark, not through a character.**

- On a journey, Mira's presence *is* the halo around the user's dot on the map: "Mira has me", literally drawn.
- Everywhere else, the small mark next to the Mira line says Mira has something to say, and its state says what kind.

| State | Purpose ("tells the user that…") | Trigger | Motion | Duration / easing | Reduced motion |
|---|---|---|---|---|---|
| `observing` | Mira is here, nothing new | Default | none (static) | none | same |
| `thinking` | Mira is working on it; wait a moment | Route/lookup pending for the Mira line; Mira chat awaiting its first token | The ring shows a 90° arc rotating | 1200 ms per turn, `--ease-linear`, infinite **while pending only**; appears after a 300 ms delay | static dashed ring (no rotation) plus text "Finding the way…" |
| `noticed` | Mira found something new that is worth reading | The Mira line's *fact key* changes (not on every re-render; on a new suggestion, a new check pending, or a changed route summary) | One ripple: the ring scales 1 → 1.6, opacity 0.6 → 0 | 600 ms, `--ease-out`, **once** | none; the new text is enough |
| `attention` | Something needs you | Missed check-in, sharing paused, location lost on a journey, worker down | The colour changes to `warm`; **no loop** | 180 ms colour transition | same (colour only) |
| `with-you` | Mira is with you on this journey | An open journey (`active` state) | A slow breath on the map halo (radius +20%, opacity 0.22 ↔ 0.12) and the capsule mark in sync | 3200 ms, sine (`ease-in-out`), infinite while the journey is active; **stops** in `attention` and `missed` | static halo at 0.18 opacity |
| `elevated` (the I feel unsafe sheet is open, or `missed`) | Mira is focused on you; it's calm, no theatre | The unsafe sheet opens; the trip state is `missed` | **All ambient motion stops**: the halo stops breathing and the ring goes solid | instant | same |

Implementation notes:
- The map halo uses MapLibre paint properties (`circle-radius`, `circle-opacity`) driven by a `requestAnimationFrame` loop that runs **only** while journey-active, visible and not reduced-motion. The loop pauses on `visibilitychange` to save battery (Life360 battery complaints, 03 Part 4 §1).
- The DOM Pulse uses CSS keyframes (`mira-arc`, `mira-ripple`, `mira-breath`) toggled by a `data-state` attribute.
- **Only one element on screen may be animating in an ambient loop at any time** (the `with-you` breath). The `thinking` arc is not ambient; it is tied to a pending request.

---

## 4. Motion catalogue

For each motion: **purpose** · **trigger** · **duration / easing** · **reduced-motion behaviour**.

### 4.1 Navigation transitions (tab switches, pushes)
- **Purpose:** keep orientation without slowing the user.
- **Trigger:** tab tap, or a route push (Home → Trip, Contribute → Report).
- **Motion:** tab roots **don't animate** (instant, like native tab bars). Pushes (Report, Circle, Inbox, Trip) fade in with 8 px upward travel.
- **Timing:** 200 ms `--ease-out`. Back is a 140 ms fade.
- **Reduced:** instant.
- **REPLACE:** the page-level `animate-rise` on headers and cards (31 uses) is removed from tab roots. It is kept only where it marks new content arriving (a new message, a new card).

### 4.2 Map interactions
- **Camera fit to route or destination**
  - Purpose: show the whole way.
  - Trigger: a destination is picked or a route alternative is changed.
  - Timing: 600 ms (MapLibre default easing).
  - Reduced: `duration 0`.
- **Recenter** (locate button)
  - Purpose: back to you.
  - Timing: 600 ms `easeTo`.
  - Reduced: jump.
- **Follow** on a journey: KEEP the existing follow behaviour. Camera updates are ≤ 1 per fix and use `easeTo` 400 ms.
- **Long-press**
  - Purpose: "this spot is selected".
  - Motion: a 32 px accent ring appears at the press point, scaling 0.96 → 1 over 180 ms, then the spot card rises from the top chrome (§4.10 card enter). The existing ghost-tap guard (`pressArmed`) is KEEP.
  - Android: `vibrate(8)` on long-press recognition.
  - Reduced: the ring appears without scaling.
- **Pin tap**
  - Purpose: "selected".
  - Motion: pin scale 1 → 1.1 plus accent ring, 150 ms.
  - Reduced: ring only.

### 4.3 Destination selection (Home → route sheet)
- **Purpose:** continuity from intent to the decision.
- **Trigger:** a result, chip or pin is picked.
- **Motion, in order:**
  1. The search overlay fades out (160 ms).
  2. The sheet animates to `half` (`--dur-sheet`).
  3. The camera fits (600 ms), in parallel.
  4. The Mira line in the sheet shows `thinking` until the route arrives, then crossfades to the summary (120 ms) with one `noticed` ripple.
  5. Evidence rows fade in (200 ms). They do not stagger individually.
- **Reduced:** the sheet snaps, the camera jumps, and the text swaps.

### 4.4 Journey activation ("Go with Mira")
- **Purpose:** mark the moment Mira takes over. It is the product's key moment and gets **the one orchestrated transition**.
- **Trigger:** a successful `POST /api/trips` (never optimistic; the trip must exist).
- **Motion:**
  1. The primary button shows `busy`.
  2. On success, the route line thickens 5 → 6 px (200 ms).
  3. Navigation to `/trip` crossfades (200 ms).
  4. On `/trip`, the presence halo **fades in** around the dot (400 ms), then starts breathing.
  5. The journey sheet enters at `half`.
  6. The Mira line reads "You're on your way. {Circle status}."
  7. Android: `vibrate(10)`.
- **Total:** under 900 ms.
- **Reduced:** crossfade only, and a static halo.

### 4.5 Mira thinking
See the Pulse `thinking` state (§3). In chat, the typing dots (KEEP) appear only until the first streamed token.

### 4.6 Mira noticing
See the Pulse `noticed` state (§3). **At most one ripple per screen per 30 s.** Never on first page load (only on a change while viewing).

### 4.7 Reports
- **Tile press:** `active:scale-[0.98]` (100 ms). The category transition to the form is a crossfade plus 8 px (200 ms).
- **Send:** button `busy` → on success the form is replaced by the thanks state. A check icon draws its stroke (240 ms, `stroke-dashoffset`). "Thank you" text fades (200 ms). **No confetti, no emoji.**
- **Reduced:** the check is shown fully drawn and the text swaps.

### 4.8 Verification (MIRA Check answer, correction)
- **Purpose:** the answer was taken; nothing more is claimed.
- **Motion:** the chosen chip fills (180 ms, `--dur-state`). The card collapses its height to the result line (240 ms), which reads "Thanks. Waiting for someone else to confirm."
- **Reduced:** instant swap.

### 4.9 Contribution acknowledgement (a later confirmation)
- **Purpose:** close the loop when an earlier answer becomes verified.
- **Trigger:** on Contribute or Home load, the verified count is greater than the last value seen on this device (07 §A.4).
- **Motion:** the adaptive card enters (§4.10) with one `noticed` ripple. The count number **does not tick up** (no slot-machine counters).
- **Reduced:** the card appears.

### 4.10 Cards and banners entering (adaptive slot, status banners, spot card)
- Enter: opacity 0 → 1 and `translateY(6px)` → 0, 240 ms `--ease-out`, using the `@starting-style` pattern.
- Exit: opacity to 0, 160 ms `--ease-in`, then height collapse 160 ms.
- Status banners on Trip enter **without** translate: an opacity-only 180 ms fade, because they need to be read immediately and must not jump.
- **Reduced:** opacity ≤ 120 ms.

### 4.11 Mira Scout recognition
- **Purpose:** a quiet earned moment.
- **Trigger:** `steward` flips from false to true (compared with the device's last-seen value).
- **Motion:** the recognition card enters (§4.10). The scout ring draws around the Pulse mark (stroke draw, 600 ms `--ease-out`) **once**. There is no repeat and nothing appears on later visits.
- **Reduced:** static.

### 4.12 Emergency and help interactions
- **Emergency pill:** press feedback only (100 ms). It is `tel:` immediately. **No hold-to-call, no countdown** (it opens the dialler, where the OS asks the user to press call; the dialler is the confirmation). Research on accidental SOS (03 Part 4 §12) concerns *auto-dial*, which Mira never does.
- **I feel unsafe:**
  - The sheet enters from the bottom (`--dur-overlay` 280 ms, `--ease-out`). The scrim fades 200 ms.
  - Content is **already rendered** (C-10.3). There is no skeleton shimmer if data is prefetched.
  - A Help Points loading state uses a static "Looking for Help Points near you…" line, not a shimmer.
  - Ambient motion elsewhere stops (§3 `elevated`).
- **Tell my people now / Send:** the button goes `busy`, then its result line appears inline (180 ms fade). The copy states the true outcome (KEEP).
- **I'm okay now:** the sheet exits (160 ms). The journey halo resumes after 1 s.
- **Reduced:** opacity only.

### 4.13 Route changes
- **Alternative selected:** the chosen route line takes the accent and 5 px. The previous one fades to `--map-route-alt` (180 ms, a paint transition). The Mira line updates with a crossfade (120 ms), with no ripple (the user caused the change).
- **Mode switch** (Walk / Ride / Transit): the segmented thumb slides (180 ms `--ease-out`). Content below crossfades.
- **Reduced:** instant.

### 4.14 Journey completion
- **Arrived** (auto-detected or "I'm here"):
  - The halo **stops breathing** and settles (a 400 ms scale-down to the plain dot).
  - The journey sheet is replaced by the arrived state: the check draws (240 ms) and "You made it." fades in.
  - The one question card follows (240 ms enter, 300 ms delay).
  - Android: `vibrate([10, 60, 10])`.
- **Ended without arriving:** no check draw. It reads "Journey ended." and fades.
- **Reduced:** static.

### 4.15 Loading
- **Skeletons:** a shimmer at 1.4 s (KEEP), only for content with a known shape that takes > 300 ms. Under reduced motion the shimmer is replaced by a static `sunken` block.
- **Inline text loading** ("Finding the way…") appears after a 300 ms delay (no flash on fast responses).
- **Button busy spinner:** KEEP (a 700 ms rotation). Reduced: a static ring with the "…" label.

### 4.16 Success
- Toast enter: `translateY(8px)` + opacity, 200 ms. Exit 160 ms.
- An inline check draw for confirmations that matter (report sent, arrived, answer taken).
- **No** confetti, bouncing, scale pops or emoji.

### 4.17 Errors
- Inline error text fades in (160 ms). **No shake** (it reads as blame and is inaccessible).
- Retrying shows a busy state on the retry button.
- **Reduced:** instant.

### 4.18 Gestures
| Gesture | Where | Behaviour |
|---|---|---|
| Drag the sheet handle | Home, Trip | Follows the finger 1:1 and snaps on release. Today the snap is by position (72% / 42% thresholds). Optional Phase 9: velocity > 0.4 px/ms projects to the next detent in the flick direction. |
| Tap the handle | same | Cycles peek → half → full → peek (KEEP; keyboard accessible). |
| Long-press the map (≈500 ms) | Home | Spot card (Report here / Go here). KEEP the ghost-tap guard. |
| Pinch / pan the map | all maps | MapLibre default. Panning the map while the sheet is `full` snaps the sheet to `half` (a map touch means map intent). |
| Swipe the toast down | toasts | **CONSIDER LATER** (Sonner idea). |
| Edge-swipe back | iOS/Android system | Must work: overlays use history entries (`useOverlay`, KEEP). |
| **No** shake-to-report, **no** power-button or volume gestures, **no** hidden gestures for safety actions | none | Accidental-trigger research (03 Part 4 §12). |

### 4.19 Bottom sheets
- **Snap:** `--dur-sheet` 380 ms `--ease-sheet` (REFINE from 300 ms and the overshoot curve).
- **While dragging:** no transition.
- **Content crossfade** when the sheet's mode changes (Home default ↔ route ↔ active-trip capsule): 160 ms out, 200 ms in. The sheet height animates at the same time.
- **Reduced:** snap instantly, and a 120 ms content crossfade.

### 4.20 Search overlay
- **Open:** the Home search field is a button. The overlay fades in (200 ms), and the input sits exactly where the field was, then moves to the top (a 240 ms `translateY`) while the results fade in. This gives continuity from the field to the overlay. If exact continuity is hard, use a plain fade (acceptable).
- **Close:** fade 160 ms.
- **Reduced:** fade only.

---

## 5. Haptics (progressive enhancement, Android only)
| Moment | Pattern |
|---|---|
| Long-press recognised | `vibrate(8)` |
| Journey started | `vibrate(10)` |
| Arrived | `vibrate([10, 60, 10])` |
| I feel unsafe opened | none (don't startle) |
| Error | none |

Guard every call with `"vibrate" in navigator` and a user gesture context. iOS gets none (no API; don't use overlay hacks, per 03 Part 3 §10). Add a post-launch Me setting "Vibration".

## 6. Removals (motion that exists today and goes)
| Current | Why it goes |
|---|---|
| `animate-breathe` on MiraOrb (every non-calm orb) | decorative loop; replaced by the Pulse states |
| `animate-rise` with overshoot on static page content (31 uses) | decoration; overshoot is dated |
| `animate-ping` live dots (3 uses) | replaced by the `with-you` breath on the capsule mark; `ping` reads as an alarm |
| Gradient-shadow glows on buttons and the tab bar | not motion, but visual noise that animates on press |
| Report tile gradients | not motion; removed with the re-skin |

## 7. Acceptance checks for motion (used by 09)
1. With OS reduced motion on, no element moves, scales, rotates or breathes. Opacity fades ≤ 120 ms are allowed.
2. At most one ambient loop on any screen (the journey breath only).
3. No UI transition exceeds 300 ms except the sheet (380), the map (600) and the breath.
4. With `navigator.onLine = false`, the Pulse never shows `thinking` longer than the real pending request.
5. The journey breath rAF loop is paused while `document.visibilityState === "hidden"`.
