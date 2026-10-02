# Phase 4 physical-device gate

Run this on **one physical iPhone using Safari and one physical Android phone using Chrome** against the same test revision. Chromium mobile emulation is already covered by automation and does not satisfy this gate. Use test accounts, a test contact and a non-sensitive walking route; do not capture exact coordinates, bearer links, contact addresses or route traces in screenshots or logs. Do not deploy from this protocol.

## Record before each run

Device model and OS/browser versions; test revision; location permission state; battery percentage; low-power mode; network type; whether a screen wake lock was granted; test account/contact pseudonyms; UTC start time. Record the worker readiness result without credentials or tokens. Repeat with wake lock unavailable or denied where the browser supports that state.

## Actions and expected observations

1. Create a named-origin plan for a mapped walk whose origin is near the phone. Set departure to the current local time. Confirm that no journey or contact link exists before pressing **Start chosen walk** and again before **Confirm start**. Confirm start; note the trip receipt, ETA, recipient list and the last device/shared update ages. A remote-origin or future-time plan must refuse live start without replacing its planned origin with the phone's position.
2. Leave the trip visible for ten minutes, walking a short public route. Every minute note battery percentage, device fix age/accuracy, last successful upload age, ETA/check-in text, network state and wake-lock state. Check a test contact's live link only if explicitly selected; a private trip must create no contact link. Do not infer GPS accuracy from the map marker alone.
3. Hide/lock the screen for ten minutes. Record the actual time of the last successful position upload and whether the browser stopped JS/GPS. The contact view must age the last spot rather than claim live movement. A healthy worker must still enforce the missed check-in rule; do not interpret GPS silence as danger or send an unchosen alert.
4. Resume the browser. Record how long it takes to obtain a new fix and upload, whether the screen clearly shows the old fix until then, whether any stale Help Point ranking appears, and whether ETA/route review requires a fresh check. Deny location once and repeat the support action: Emergency and contact/dial actions must remain directly available while candidate routing becomes unknown.
5. Open **I feel unsafe** with fresh location and with the stale/denied state. Check source/hours labels, known-closed filtering, route-unverified and staffing-unverified copy, external directions, direct Emergency, and no automatic contact notification. Choose a candidate change and cancel; nothing changes. Confirm with a manual ETA; verify the same token/recipients and updated destination/ETA in the worker-backed trip view.
6. End/arrive, then check that the live link no longer exposes position. Exercise the existing 30-minute closed-link grace and six-hour purge in the dedicated test environment or with an equivalent worker fixture; never wait with a real person's live route just for retention proof.

## Result record

For each device, mark each step `PASS`, `FAIL` or `NOT RUN` with UTC timestamps, observed upload/fix ages, battery change over the ten-minute visible and hidden intervals, and a short redacted artifact reference. Record any permission, wake-lock, connectivity or provider failure separately. Phase 4 is `PASS` only if both devices pass, no hidden/locked state falsely claims fresh monitoring, support and Emergency remain usable, and worker/share/retention evidence remains green. A failure in contact consent, stale tracking truth, Emergency access, missed alerts or purge is a stop finding under [21](21_AUTONOMOUS_BUILD_PLAN.md); fix and rerun before Phase 5.
