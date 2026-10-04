/**
 * Taps before the app is ready (audit P09-004). On a slow phone the page is visible seconds before React has
 * attached its handlers, and a tap on "I feel unsafe", Emergency or "Use my location" in that gap did nothing.
 * This boot script (served with the daypart script, before paint) remembers such taps and any text typed into the
 * Mira box; once the app mounts, components/app/EarlyTaps replays them. A tel: link is never held: it dials natively.
 */
export const EARLY_TAP_SCRIPT = `(function(){
  if (window.__miraEarly) return;
  var taps = [], text = {};
  window.__miraEarly = { taps: taps, text: text };
  document.addEventListener("click", function (e) {
    if (window.__miraReady) return;
    var t = e.target && e.target.closest ? e.target.closest("[data-early-tap]") : null;
    if (!t) return;
    var href = t.getAttribute("href") || "";
    if (href.indexOf("tel:") === 0) return;
    e.preventDefault();
    var key = t.getAttribute("data-early-tap");
    if (taps.indexOf(key) < 0) taps.push(key);
  }, true);
  document.addEventListener("input", function (e) {
    if (window.__miraReady) return;
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-early-text")) text[t.getAttribute("data-early-text")] = t.value;
  }, true);
  // Enter in the box before the app is ready: a native submit would reload the page and lose the words (re-audit RA2).
  document.addEventListener("submit", function (e) {
    if (window.__miraReady) return;
    var f = e.target, box = f && f.querySelector ? f.querySelector("[data-early-text]") : null;
    if (!box) return;
    e.preventDefault();
    text[box.getAttribute("data-early-text")] = box.value;
    text.__submitted = box.getAttribute("data-early-text");
  }, true);
})();`;

export type EarlyTap = "unsafe" | "emergency" | "locate";
