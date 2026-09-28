# 04 — Mira Design System

**Direction:** *Calm intelligence × living city × premium companion.*
**Constraint:** evolve the existing system (`src/app/globals.css` `@theme`, `components/ui/*`, `components/app/*`). **Token names stay stable** so every screen inherits changes. Values change, a few tokens are added, and a few utilities are retired. Every item is marked **KEEP**, **REFINE** or **REPLACE** against what exists today (01 §3).

**Governing rules:** 02 (Constitution). Motion lives in 05. Per-screen application lives in 06.

---

## 0. Summary of decisions

| Area | Decision |
|---|---|
| Canvas | Violet-tinted lavender → **warm neutral paper** (REPLACE values; KEEP token names) |
| Accent | Violet `#6a44f5` → **deep lagoon teal `#1D6B63`** (one accent, meaning "Mira / you / your journey") |
| Signature gradient `bg-mira` | **REPLACE** with solid accent; the gradient is removed |
| Glass | **REFINE**: only on chrome floating over the map; sheets become solid |
| Glow backdrop `bg-companion` | **REPLACE** with a flat canvas (daypart tint only) |
| MiraOrb | **REPLACE** with the **Mira Pulse mark** (§12) |
| Emoji as icons | **REPLACE** with SVG glyphs (Icon set extended) |
| Font | Plus Jakarta Sans (Latin only) → **Instrument Sans** + **Noto Sans Devanagari** (lazy) (REPLACE) |
| Weights | extrabold (800) everywhere → 400/500/600, 700 rare (REFINE) |
| Radii | 47 arbitrary values → **5 tokens** (REFINE) |
| Shadows | violet-tinted, on everything → **neutral, only over the map** (REFINE) |
| Section labels | UPPERCASE tracked eyebrows → sentence-case footnote labels (REPLACE) |
| Tab bar | floating glass pill → **docked bar** (REPLACE presentation; same 5 items) |
| Dayparts | **KEEP** (time-of-day theming is a product signature); palettes redrawn |
| Reduced motion | **KEEP** the global kill switch; add per-component alternatives (05) |

Why teal:
- Not violet: violet is the generic "AI app" tell (03 §0.2 #16).
- Not blue: blue is the map "you" convention and reads as police.
- Not pink or red: the thesis rules them out.
- Not terracotta on cream: that is a named AI-default cluster (03 Part 3 §1).
- Deep teal reads calm, natural and premium. It holds up on Google's light and dark basemaps, where roads are white, grey and yellow.

---

## 1. Brand personality

| Is | Is not |
|---|---|
| Quiet, precise, warm, capable | Loud, cute, neon, alarmist |
| An editorial map companion (think a good city guide, not a dashboard) | A security product |
| Confident with few words | Hedging in paragraphs |
| Global and multilingual | US-centric or India-only in look |

**Signature elements** (what makes Mira recognisable without a logo):
1. The **Mira Pulse** mark and the presence halo around "you" on a journey.
2. The **Mira line**: one calm sentence with a mark, at the top of each decision.
3. **Lit stretches** glowing warm amber on the route. Light is Mira's metaphor.
4. **Time-of-day canvas**: the app's paper warms at dawn and dusk and goes dark at night.

---

## 2. Typography

### 2.1 Families — REPLACE
- **Latin: Instrument Sans** (variable `wght` 400–700; the `wdth` axis is optional and not loaded). It is precise, slightly warm and uncommon in AI templates. Load it with `next/font/google`, `subsets:["latin","latin-ext"]`, `display:"swap"` and `variable:"--font-sans"`.
- **Devanagari: Noto Sans Devanagari** (variable `wght`) with `subsets:["devanagari"]`, `preload:false` and `variable:"--font-deva"`. `unicode-range` means it downloads only when Devanagari renders.
- **Stack:** `var(--font-sans), var(--font-deva), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`.
- **Numerals:** use `font-variant-numeric: tabular-nums` for ETAs, times, distances and counts.
- `next/font` self-hosts the files at build time. That is a static asset, **not a package install**. Before coding, read `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` (AGENTS.md rule).
- **Fallback decision:** Phase 1 checks 13 px legibility and Hindi/Hinglish mixing on a real Android phone. If Instrument Sans fails, **keep Plus Jakarta Sans** (Latin) with the same Devanagari companion and the same scale. Nothing else in this document depends on the choice.

### 2.2 Type scale (mobile first)
| Token | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 34 / 38 | 600 | −0.02em | ETA number on the journey, Welcome headline |
| `title-1` | 26 / 32 | 600 | −0.015em | Tab-root screen titles (Contribute, Me) |
| `title-2` | 21 / 27 | 600 | −0.01em | Sheet titles, destination name |
| `headline` | 17 / 24 | 600 | 0 | Card titles, list primary text, **the Mira line** (500) |
| `body` | 16 / 24 | 400 | 0 | Default text |
| `callout` | 15 / 22 | 400/500 | 0 | Secondary text, button labels (600) |
| `footnote` | 13 / 18 | 500 | 0 | Section labels (sentence case, ink-subtle), metadata |
| `caption` | 12 / 16 | 500 | 0.01em | Map pin labels, tab labels, legal. **Minimum size in the app.** |

- Devanagari and mixed text: `line-height` +0.2 (the existing `:lang(hi), .text-mixed { line-height:1.7 }` is **KEEP**).
- Measure: long text ≤ 68ch (`max-w-prose`).
- **REPLACE** the 21 `uppercase tracking-wider` labels with `footnote` sentence case.
- **REFINE:** `font-extrabold` (64 uses) becomes 600. 700 only for `display` numerals when needed.

## 3. Spacing and grid

- Base unit **4 px**. Tokens are Tailwind's defaults. Use `1, 2, 3, 4, 5, 6, 8, 10, 12` (4–48 px) and no arbitrary values.
- **Screen gutter: 16 px** (`px-4`) on phones, 20 px (`px-5`) inside sheets. REFINE the current mixed 16/20.
- **Vertical rhythm:**
  - 24 px between sections;
  - 12 px between related items;
  - 8 px inside a group;
  - more space above a heading than below it.
- **Grid:**
  - Phones: one column.
  - `md` (≥768): content column max 560 px.
  - `lg` (≥1024): the **side-panel layout** (§20).
- **Bottom safe space:** content above the docked tab bar pads by `calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px)`. It is one variable, not the current mix of `pb-28/32/36`.

## 4. Colour system

### 4.1 Core tokens (names KEEP, values REPLACE)
| Token | Day (Light) | Night (Dark) | Notes |
|---|---|---|---|
| `--color-canvas` | `#F6F5F1` | `#111312` | Warm paper / warm near-black. Never pure `#fff` or `#000`. |
| `--color-surface` | `#FFFFFF` | `#1A1C1B` | Cards, sheets |
| `--color-sunken` | `#EFEEE9` | `#232625` | Inputs, segmented tracks, quiet fills |
| `--color-ink` | `#1A1A18` | `#ECEEEA` | ≈16:1 |
| `--color-ink-muted` | `#55534D` | `#AEB3AD` | ≥7:1 day, ≈8.7:1 night |
| `--color-ink-subtle` | `#6B6961` | `#8E938D` | ≥5:1 on canvas and surface (never lighter) |
| `--color-line` | `#E4E2DB` | `#2A2E2C` | Hairlines |
| `--color-line-strong` | `#CFCCC3` | `#3A3F3C` | Input borders, secondary button border |
| `--color-accent` | `#1D6B63` | `#7CC4B9` | **Mira / you / your journey / primary action.** White text on the day accent ≈6.3:1 |
| `--color-accent-strong` | `#17554F` | `#9AD3CA` | Pressed, text links on soft |
| `--color-accent-soft` | `#E3EFEC` | `#17302C` | Selected chips, info fills |
| `--color-accent-ink` | `#FFFFFF` | `#0B1F1C` | Text on accent |

### 4.2 Semantic tokens
| Token | Day | Night | Meaning, and when to use it |
|---|---|---|---|
| `--color-warm` / `-soft` (KEEP name) | `#8F4A0C` / `#FBEEDC` | `#F2B872` / `#352615` | **Attention**: something needs the user (missed check-in, location off, sending failed, checks paused). **Not danger.** |
| `--color-error` / `-soft` (KEEP) | `#B42318` / `#FDECEA` | `#FF8A80` / `#3B1D22` | **Failure only**: validation errors, failed operations. Never for places, routes or people. |
| `--color-mint` / `-soft` (REFINE) | = accent / accent-soft | = accent / accent-soft | "Confirmed / arrived / opened ✓". Merged into the accent so success reads as *Mira*. The token is kept as an alias for compatibility. |
| `--color-peach` / `-soft` (REPLACE) | aliased to `sunken` | aliased to `sunken` | Retired; 8 uses migrate. |
| `--color-light` (NEW) | `#B7791F` (icons only, ≥3:1) | `#F2C45A` | Lighting evidence glyph in the UI. Map glow stays `#FFC94D`. |
| `--color-scrim` (NEW) | `rgb(17 19 18 / 0.40)` | `rgb(0 0 0 / 0.55)` | Modal backdrops (currently hard-coded `rgb(10 6 24/0.5)`). |

### 4.3 Map colours (CSS variables read by `WorldMap`)
| Variable | Day | Night |
|---|---|---|
| `--map-route` | `#1D6B63` | `#7CC4B9` |
| `--map-route-glow` | `#5FA89E` (opacity 0.30) | `#2F6F66` (0.40) |
| `--map-route-alt` (NEW) | `#6B6961` (0.55) | `#8E938D` (0.55) |
| `--map-me` (KEEP convention) | `#2563EB` | `#60A5FA` |
| `--map-lit` (NEW, replaces the literal) | `#FFC94D` | `#FFC94D` |
| `--map-unknown` (dotted) | `#6B6480` → `#7A776F` | `#8E938D` |
| `--pin-bg` | `#FFFFFF` | `#232625` |

### 4.4 Dayparts (KEEP mechanism, REFINE values)
- **day:** base palette.
- **dawn:** canvas `#F8F3EC`, sunken `#F1EBE2`.
- **evening:** canvas `#F4F0E8`, sunken `#ECE6DB`.
- **night:** full dark palette (above).
- **REMOVE** `--glow-a/--glow-b` usage (see §7). The tint *is* the living-city signal.
- Keep the `night:` custom variant and the pre-paint `/daypart.js`.

### 4.5 Colour rules
- One accent. If two things on a screen are accent-filled, one of them is wrong (C-11.1).
- **Red means an operation failed.** Warm means "needs you". Neither ever describes a place.
- Tinted text on tinted fills uses the hue's own dark (for example `warm` on `warm-soft`), never grey on colour.

## 5. Surfaces and elevation

| Level | What | Treatment |
|---|---|---|
| 0 Canvas | Screen background | `canvas`, flat |
| 1 Card on canvas | Grouped lists, info cards | `surface` + 1 px `line`, **no shadow** |
| 2 Over the map | Top chrome, map buttons, pins | `surface` (or `.glass` for top chrome only) + `--shadow-map` |
| 3 Sheet | BottomSheet, side panel | solid `surface`, `--shadow-sheet`, radius `lg` top |
| 4 Modal | Unsafe / Emergency / Sign-in / Help-near sheets | `surface` over `--color-scrim` |
| Toast | Transient | `ink` background, `canvas` text |

- `.glass` **REFINE**: `background: color-mix(in srgb, var(--color-surface) 90%, transparent)` with `blur(12px) saturate(1.2)`, the prefixed property first (Lightning CSS gotcha). Use it **only** on the Home and Trip top chrome over the map. Remove it from the sheet and tab bar.

## 6. Radius (REFINE: 5 tokens)
| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 8 px | Pin labels, small tags |
| `--radius-sm` (was `--radius-control` 1.1rem) | 12 px | Inputs, segmented controls, list rows with fills |
| `--radius-button` (NEW) | 14 px | Buttons (md and lg) |
| `--radius-card` (was 1.75rem) | 16 px | Cards, grouped lists, modal sheet inner blocks |
| `--radius-lg` (NEW) | 24 px | Sheet top corners, modal sheets |
| full | 9999 | Chips, icon buttons, the Emergency pill, avatars |

Replace every arbitrary `rounded-[…]`, `rounded-3xl` and `rounded-[2rem]` with a token.

## 7. Borders and shadows
- Borders are 1 px (`line`), and 1.5 px (`line-strong`) for inputs on focus-less state. No 2 px borders except the selected-state ring.
- `--shadow-card` **REFINE** → `none` (cards use borders). Kept as a token for compatibility.
- `--shadow-map` (NEW): `0 1px 2px rgb(0 0 0 / .08), 0 4px 12px rgb(0 0 0 / .10)`. Night: `.35/.45`.
- `--shadow-sheet` (NEW): `0 -6px 24px rgb(0 0 0 / .10)`. Night: `.5`.
- `--shadow-float` **REFINE** → `= --shadow-map`.
- **REPLACE** all violet-tinted `shadow-[0_…rgb(106_68_245/…)]` literals (Button, TabBar).
- **REPLACE** `bg-companion` with `bg-canvas`.
- **REPLACE** `bg-mira` with `bg-accent`. Keep the utility name, aliased, until all 4 uses migrate, then delete it.

## 8. Icons (REPLACE emoji → SVG)
- **Style:** 24 px grid, 1.75 px stroke, round caps and joins, `currentColor`. This matches the existing 29 icons in `components/ui/Icon.tsx`. Sizes: 16 (inline), 20 (list and tab), 24 (actions).
- **New glyphs** (≈30), drawn in the same file:

  | Group | Glyphs |
  |---|---|
  | Help Point classes | `hospital` (cross in rounded square), `police` (a building with a flag; **not** a badge or shield), `transit` (train front), `airport` (plane), `hotel` (bed), `pharmacy` (capsule), `fuel` (pump), `store` (bag) |
  | Place kinds | `cafe`, `food`, `shop`, `park`, `school`, `atm`, `toilet`, `bus`, `pin` (fallback) |
  | Saved places | `home` (exists), `work` (briefcase), `study` (book), `star` |
  | Report categories | `speech` (harassment), `footsteps` (followed), `hand` (unwanted touch), `lamp` (street/lighting), `bus` (transport), `sun` (something good), `dots` (something else) |
  | States | `bulb`/`lit`, `wifi-off`, `battery`, `eye` (who can see), `timer`, `check-circle` |

- **Mapping:**
  - `kindEmoji()` becomes `kindIcon()` (same matching rules).
  - `HELP_CLASSES[c].emoji` stays in the domain (it's used in copy and tests), and a UI map `HELP_ICON[c]` is added.
  - Saved-place emoji remain **user data** (the stored `emoji` column). They render inside a neutral tile as the user's own label decoration, **not** as system iconography. See 06 §3.2.
- **Emoji MUST NOT** appear in system copy or as icons (C-17.3). Mira's chat MAY mirror user emoji.

## 9. Buttons (`components/ui/Button.tsx`)
| Variant | Today | New | Use |
|---|---|---|---|
| `primary` | violet fill + violet shadow | **accent fill**, no shadow, `radius-button` | The one primary action per screen |
| `hero` | gradient `bg-mira` | **REPLACE → alias of `primary`** (keeps call sites compiling; remove later) | none |
| `secondary` | surface + border + shadow | surface + 1 px `line-strong`, no shadow | Second-rank actions |
| `ghost` | accent text | KEEP (rename in docs to **quiet**) | Tertiary, inline |
| `danger` | ink outline 2 px | KEEP (ink outline, 1.5 px) | Irreversible (end trip, delete) |
| `ink` (NEW) | none | `ink` fill, `canvas` text | **Emergency only** (`EmergencyPill block` already uses this) |

- **Sizes:** `md` 44 px (`min-h-11`), `lg` 52 px (`min-h-13`, full width). Label `callout` 600.
- **Press:** `active:scale-[0.98]` (KEEP) plus background step. Duration and easing are in 05.
- **Busy:** KEEP the spinner and `busyLabel`, which block double submission.
- **Disabled:** 45% opacity plus `cursor-not-allowed`. The reason is always stated nearby (for example "Turn on location to start").

## 10. Inputs (`Field.tsx`, search field, textarea)
- Height 48 px, `radius-sm`, `sunken` fill, 1.5 px `line-strong` on focus-visible → 2 px accent ring.
- Labels above, `callout` 600. Hints in `footnote` `ink-muted`. Errors in `footnote` `error` with an icon, placed under the field and linked by `aria-describedby`.
- The search field on Home is a **button that looks like a field** (it opens the overlay). Keep it as a `button`, height 52, with the `search` icon and placeholder `ink-subtle`.
- Chips (`Chip.tsx`): 40 px min height (hit area 44 via padding), full radius, `surface` + `line`. Selected = `accent-soft` + `accent-strong` text + 1.5 px accent border.
- Segmented control (Walk / Ride / Transit): `sunken` track, `surface` thumb, `radius-sm`, and the thumb slides (05).
- Switches: use real `role="switch"` buttons (KEEP). Recommended: a native `<input type="checkbox" switch>` progressive enhancement gives iOS haptics legitimately (post-launch, 03 Part 3 §10).

## 11. Cards
- **One card style:** `surface`, 1 px `line`, `radius-card`, padding 16 (20 in hero cards). No shadow on canvas.
- **Grouped list** (Me, Contribute, Help Point lists): a card with `divide-y divide-line`. Rows are 56 px min: leading icon 20 in a 36 px `sunken` tile, text, trailing chevron or value.
- **Adaptive card** (Home slot): same card style plus the Mira Pulse mark (16) leading, one line of text, one quiet action.
- **Status banners** (Trip: worker down, GPS lost, email failed, missed): `warm-soft` fill, `warm` title (600), `ink-muted` body, leading icon, `role="alert"` or `status` as today. **No** accent tints.
- **MUST NOT:** nested cards, cards inside cards inside sheets. Inside a sheet, prefer **unboxed sections** separated by spacing and hairlines. Boxes are only for things that need a boundary (the lighting evidence block, status banners, action cards).

## 12. The Mira Pulse mark (REPLACE MiraOrb)
The visible presence of Mira. **It carries state; it is never decoration.** Component: `components/app/MiraPulse.tsx` (new). It replaces `MiraOrb` in all 51 references. Keep `MiraOrb` as a re-export during migration.

- **Geometry:** a solid inner dot (38% of the size) plus a 1.5 px concentric ring (100%). Sizes 12 / 16 / 24 / 40. Colour `accent` (`warm` in attention).
- **No gradient, no glow, no sparkle.** The sparkle icon stays only as the Mira tab glyph, where it names the companion.

| State | Visual | Where |
|---|---|---|
| `observing` (default) | Dot plus ring at 35% opacity, static | Mira line, Mira tab header, Mira replies |
| `thinking` | Ring shows a 90° arc that rotates (05 §3) | While a route/lookup is loading for the Mira line; while Mira streams |
| `noticed` | One ripple: the ring scales 1 → 1.6 and fades (once) | When the Mira line changes to a *new fact* (for example a habit suggestion appears) |
| `attention` | Ring solid `warm`, dot `warm`, static | Missed check-in, sharing paused, location off during a journey |
| `with-you` | Slow halo breath (3.2 s) | **Only** on an active journey: the journey capsule, and the halo around the "you" dot on the journey map |

On the map, the `me-halo` layer (currently a 22 px blue circle at 22%) becomes the **presence halo** during a journey. It uses the accent colour, a breath animation driven by `circle-radius` or `circle-opacity` interpolation, and reduced-motion is static. Outside a journey the dot stays the standard blue "you" dot with no halo.

## 13. The Mira line
- One sentence, `headline` weight 500, ink, and ≤ 2 lines on a 360 px screen. It is led by a Mira Pulse (16) and may be followed by one quiet action (`callout` 600, accent).
- **Deterministic:** composed by a pure function (proposed `src/domain/mira-line.ts`) from data already fetched. 07 §A.2 has the rules. Never LLM (C-12.2).
- It never contains safe / unsafe / danger words. A unit test runs every template through the existing output guard (`src/domain/companion-output.ts`).
- **Placement:** top of the Home sheet, top of the route sheet (replacing the scattered context lines as the *summary*; the evidence stays below), and the journey sheet (status sentence).

## 14. Bottom sheets (`BottomSheet.tsx`)
- **REFINE:**
  - Solid `surface`.
  - `radius-lg` top.
  - Grabber 36×5 `line-strong`, inside a 44 px handle button (KEEP it as a keyboard-operable button).
  - `--shadow-sheet`.
- **Detents:**

  | Detent | Height | Content rule |
  |---|---|---|
  | `peek` | `max(38dvh, 300px)` | Must show the Mira line, search, saved chips and the adaptive slot on a 390×844 phone. |
  | `half` | `56dvh` | |
  | `full` | `calc(100dvh - var(--chrome-top))` | **Never covers the top chrome or the help anchors** (C-10.2). `--chrome-top` = safe-area top + header height + help row + 8 px, set by the screen. |

- **Map padding:** on snap change, call `map.setPadding({bottom: sheetHeightPx})` **once** (repo gotcha: never pass padding per `easeTo`/`fitBounds` call). The locate button follows the sheet edge.
- **Scroll:** content scrolls inside (`overscroll-contain`, KEEP).
- **Optional (Phase 9):** move to a `transform`-based sheet with velocity snapping (03 Part 3, follow-up #1). **KNOWN RISK:** the MapLibre padding and portal stacking gotchas. Only do this after Phase 3's acceptance tests pass, and keep the height-based fallback.
- **Modal sheets** (Unsafe, Emergency options, Help near, Sign in): portalled (KEEP), `--color-scrim`, `radius-lg`, max-width 480 centred on `sm+`, focus moves to the heading, Escape and back close (`useOverlay`, KEEP). Keep them mounted and toggle `open` (repo gotcha).

## 15. Toasts (`Toast.tsx`)
- KEEP the polite live region, the 4 s / 6 s timers and the max of 3.
- REFINE:
  - `radius-card`;
  - 15 px text;
  - `ink` background;
  - the error tone uses `error` background with `canvas` text.
  - Position: above the docked tab bar on **all** breakpoints (fixes the desktop overlap). On `/trip` (no tab bar) it sits 16 px above the sheet's visible top.
- Safety-critical outcomes never rely on a toast alone. They also appear inline (existing pattern on Trip).

## 16. Modal behaviour
- Use a modal only for:
  - I feel unsafe;
  - Emergency options;
  - Help Points near me;
  - Sign in;
  - destructive confirmations (inline today, KEEP inline).
- Everything else is a non-modal sheet state or a page.
- Opening a modal pushes a history entry (KEEP `useOverlay`), so back closes it.
- **Adopting native `<dialog>`** (focus trap, top layer) is CONSIDER LATER (post-launch). Safari lacks `closedby`, and the current portal pattern works.

## 17. Navigation (`TabBar.tsx`)
- **REPLACE the presentation, KEEP the items and order:** Home · Mira · Trips · Contribute · Me (the locked Day-0 navigation, C-6.3).
- **Docked bar:**
  - full width;
  - `surface` background with a 1 px top `line`;
  - height 56 + safe-area;
  - icons 22;
  - labels `caption` 600.
  - Active: accent icon (filled variant where available) plus accent label, with a 2 px accent bar at the top edge of the item. **No filled pill.**
- **Hidden during an open journey** on `/trip` (immersive journey mode, 06 §3.5). The journey header's back button returns to `/trips`. The bar reappears when the journey closes.
- **Hidden** on `/welcome`, `/t/*`, `/invite*`, `/auth/*` and `/admin/*` (as today: these are outside the `(app)` layout).
- `aria-label="Main"`, `aria-current="page"` (KEEP; E2E contract: links named Home, Mira, Trips, Contribute, Me).

## 18. Maps
- **Basemap:** Google raster day/night (KEEP), OpenFreeMap fallback.
- **Attribution:** Google logo and attribution (KEEP, legible).
- **Controls:** the locate button is a 48 px round `surface` with `--shadow-map` and an accent glyph. It sits 16 px from the right edge and follows the sheet top.
- **Pins** (`.mira-pin`, DOM markers) — REFINE:
  - 28 px circle, `pin-bg`, 1 px `line` ring and `--shadow-map`.
  - An **ink SVG glyph** (not emoji).
  - The label is `caption` 600 on a `pin-bg` pill below, shown at zoom ≥ 15 or when focused.
  - Help Points with `emergency: true` (hospital, police) get a 2 px `ink` ring.
  - Selected: accent ring plus scale 1.1.
  - Max visible pins per 06 §3.2.
- **"You":** blue dot plus white ring (KEEP). During a journey it adds the presence halo (§12).
- **Destination:** 12 px accent dot, 4 px `pin-bg` ring, and a label with the destination name.

## 19. Route visuals
| Element | Style |
|---|---|
| Chosen walking route | `--map-route`, 5 px, round caps, with `--map-route-glow` 11 px underneath |
| Alternative routes (when shown) | `--map-route-alt`, 4 px, no glow, tappable (selects the option) |
| Approximate (straight line) | `--map-route`, 4 px, dash `[1.2, 1.6]` (KEEP) |
| Lit stretches | `--map-lit` glow under the route, 14 px, 0.5 opacity; "poles" (Mapillary) at 0.3 (KEEP logic) |
| Not-lit / unknown | dotted `--map-unknown`, 3 px (KEEP logic) |
| Ride / transit | provider geometry in `--map-route-alt` (a ride isn't walked, so it gets no glow) |

## 20. Community reports and contribution visuals
- **Report category grid:** two labelled groups:
  - "On the street" (lighting/broken street, transport, something good);
  - "Something that happened" (harassment, being followed, unwanted touch).

  "Something else" is a quiet text button. Group order depends on the entry point (06 §3.13).
- **Tiles:** `surface` card, 20 px icon in a 40 px `sunken` tile, a `headline` label and a one-line `footnote` hint (from `CATEGORY_HINT`). Min height 88. **No pastel gradients** (REPLACE the `from-rose-50…` literals).
- **MIRA Check card** (`CheckCard.tsx`): the question as `headline`; the answer chips (Open / Closed / Didn't notice) as full-width segmented buttons; a `footnote` privacy line collapsed behind "How this is used".
- **Contribution states:** *sent* (inline check plus "Waiting for someone else to confirm"), *confirmed* (accent check), *reports differ* (neutral), *expired* (neutral). No celebration.

## 21. Mira Scout visual treatment
- **Mark:** the Mira Pulse mark with a **second outer ring** (the "scout" ring, 1 px, accent at 50%) at 20 or 24 px. It is not a medal, shield, star or badge shape.
- **Label:** "Mira Scout" in `callout` 600, accent-strong. The optional qualifier is `footnote` ink-muted ("· since September" when the date is known; see 07 §C.5).
- **Where:**
  - the Me impact row (a small inline tag, replacing today's "Local Steward" tag);
  - the Contribute impact section header;
  - a one-time recognition card (06 §3.12).
- **Never** on the map, the shared view, any other user's screen, or a notification.

## 22. AI messages (`MiraChat.tsx`)
- **User messages:** right-aligned `sunken` bubble, `radius-card` with a 6 px tail corner, `body`.
- **Mira messages:** no bubble. Plain `body` text in `ink` on the canvas, with the Mira Pulse (16) beside the first line of each Mira turn only (not on every message). **REPLACE** the per-message orb avatar.
- **Cards:** the §11 card style with a `footnote` card label ("Journey", "Help Points nearby"). One primary button per card (`primary`, not gradient).
- **Streaming:** the Pulse `thinking` state plus the existing typing dots, shown only until the first token.
- **Failure:** `warm-soft` block, `role="alert"` (KEEP), and "Your message is back in the box" (KEEP).
- **Header:** title "Mira" plus the one-line subtitle "Ask about places, your journey, or what Mira knows here." (REPLACE the jargon).
- **Composer:** docked above the tab bar, `surface`, 1 px `line`. The suggestion chips sit above it, scrollable, max 5.

## 23. Empty states
- The pattern is one sentence of what will appear here, plus one action if there is a useful one. No orb, no illustration, no emoji. Examples:
  - **Trips:** "No journey right now. When you go with Mira, it shows here until a day after you arrive." [Where are you going?]
  - **Inbox:** "All quiet. Contacts accepting and anything that needs you on a journey will show here."
  - **Contribute impact:** "Nothing confirmed yet. When someone else confirms what you told Mira, it shows here."

## 24. Loading states
- **Skeleton** (KEEP the `.skeleton` utility; REFINE the colours to `sunken` → `line`) for lists and cards with known shape.
- **Inline "Finding the way…"** text plus Pulse `thinking` for route and Mira line lookups. Show it after 300 ms to avoid flashes.
- Buttons use `busy` (KEEP).
- Never block Emergency or I feel unsafe on loading (C-10.3).

## 25. Error states
- The four states are visually and verbally distinct (C-3.4):

  | State | Copy pattern | Visual |
  |---|---|---|
  | **Unknown** (no data exists) | "Lighting on this way isn't mapped." | neutral text |
  | **Empty** (a lookup succeeded with nothing) | "No Help Points found along this way." | neutral text |
  | **Failed** (a lookup failed) | "Couldn't check lighting right now." + [Try again] | neutral text plus a quiet retry |
  | **Unavailable** (capability off) | "Email alerts aren't available in this version." | neutral text |

- Operation failures (a send failed, the account wasn't deleted) use the `error` tone with the problem and the recovery.
- Offline: a single, calm line at the top of the sheet ("You're offline. Emergency calling still works."). Uses `navigator.onLine` plus request failures; it is presentation only.

## 26. Emergency states
- **Emergency pill** (Home and Trip top chrome): 44 px, `surface`, 1 px `line-strong`, ink phone glyph, label "Emergency 112" or "Emergency options". `--shadow-map`. It is not accent-coloured and not red.
- **In sheets** (Unsafe, the Mira sos card): the `ink`-filled block (KEEP `EmergencyPill variant="block"`).
- **I feel unsafe anchor:** paired with the Emergency pill as a **help cluster** (06 §3.2). It is `surface`, with an accent label, the same height and the same row.
- **Missed check-in:** a `warm` attention banner at the top of the journey sheet; the Pulse goes to `attention`. The "I'm here" button stays primary.
- **Never:** red fills, flashing, siren icons, full-screen takeovers.

## 27. Accessibility (floor, all MUST)
- WCAG 2.2 AA:
  - text ≥ 4.5:1;
  - large text and UI components ≥ 3:1 (the §4 values meet this);
  - focus visible (a 2 px accent outline, 2 px offset; KEEP the rule, recolour it).
- Targets ≥ 44×44 CSS px (48 preferred for primary). Spacing ≥ 8 px between adjacent targets.
- Everything on the map is also in the sheet as text (KEEP).
- Live regions: toasts are polite, safety banners are `alert` or `status` (KEEP), and Mira replies are announced once (KEEP).
- Text zoom to 200% without loss. The sheet content scrolls. No fixed heights on text containers.
- Reduced motion: every animation has a static alternative (05). Pulse states are distinguishable without motion (arc = thinking, filled warm = attention, double ring = scout).
- Language: `lang` on the Hindi/Hinglish content containers where known (existing `text-mixed` class; KEEP).
- Colour is never the only carrier: route alternatives carry labels, and states carry text.

## 28. Dark mode decision
**KEEP automatic time-of-day theming as the default, plus the manual Light/Dark pin** (Me → App). Reasons:
- At night a dark UI protects night vision and discretion on the street.
- It is a distinctive "living city" behaviour.
- The owner already shipped it.

The night palette is redrawn to a warm neutral near-black (not violet-black). The map switches to Google's dark style at night (KEEP).

## 29. Breakpoints and desktop adaptation
| Breakpoint | Layout |
|---|---|
| < 640 (phones) | Full-bleed map, bottom sheet, docked tab bar |
| 640–1023 (large phones, tablets) | Same; the sheet and modals max out at 560 px, centred |
| ≥ 1024 (desktop) | **Side-panel layout.** The sheet becomes a left panel (400 px, full height, no drag, scrolls). The tab bar becomes a left rail of 72 px (icons plus labels). The top chrome and help cluster sit at the top of the panel. The map fills the rest, with its padding set to the panel width. Modal sheets become centred dialogs (480 px). |

The desktop panel is SHOULD for launch (Phase 10). If it's cut, the current centred-column behaviour remains acceptable but gets fixes (toast overlap, full-snap covering the anchors).

## 30. Token migration table (for the implementer)
| Old usage | New |
|---|---|
| `bg-mira`, `variant="hero"` | `bg-accent`, `variant="primary"` |
| `bg-companion` | `bg-canvas` |
| `shadow-[var(--shadow-card)]` on canvas cards | `border border-line` (and no shadow) |
| `shadow-[0_…rgb(106_68_245…)]` literals | removed |
| `rounded-3xl`, `rounded-[1.6rem]`, `rounded-[2rem]`, `rounded-[var(--radius-card)]` | `rounded-[var(--radius-card)]` (16) or `--radius-lg` (24) per §6 |
| `font-extrabold` | `font-semibold` |
| `text-sm font-bold uppercase tracking-wider text-ink-subtle` | `text-[13px] font-medium text-ink-subtle` (the footnote label) |
| `peach`, `peach-soft` | `sunken` / `accent-soft` per context |
| `mint`, `mint-soft` | `accent`, `accent-soft` |
| `MiraOrb` | `MiraPulse` |
| `animate-rise` on static content | removed (05 §6) |
| emoji in JSX | `<Icon name=…>` |
