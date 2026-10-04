// Offline emergency numbers (audit P08-005). The offline page can't ask Mira for the country, so it reads the last
// country Mira confirmed from the phone's own position (stored by the app as "mira.country.lastKnown": a country, never
// a position) and shows its numbers as tap-to-call links — the same 24-hour rule the app uses. Plain DOM, no innerHTML.
(function () {
  var box = document.getElementById("call");
  if (!box) return;
  var DAY = 24 * 3600 * 1000;
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem("mira.country.lastKnown") || "null"); } catch { saved = null; }
  var fresh = saved && saved.country && typeof saved.checkedAt === "number" && Date.now() - saved.checkedAt >= -10000 && Date.now() - saved.checkedAt < DAY;
  var numbers = [];
  if (fresh) {
    var em = saved.country.emergency || {};
    [em.primary].concat(em.also || [], em.services || []).forEach(function (n) {
      if (n && n.number && !numbers.some(function (x) { return x.number === n.number; })) numbers.push({ number: String(n.number), label: String(n.label || "Emergency") });
    });
  }
  function link(number, label) {
    var a = document.createElement("a");
    a.className = "btn call";
    a.href = "tel:" + number.replace(/[^\d+]/g, "");
    a.textContent = label + " " + number;
    return a;
  }
  var note = document.createElement("p");
  if (numbers.length) {
    var when = new Date(saved.checkedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    note.textContent = saved.chosen
      ? "For " + (saved.country.countryName || "the country") + ", the country you chose. If you're somewhere else, use your phone's own emergency call."
      : "For " + (saved.country.countryName || "the country") + ", where Mira last confirmed your phone was (" + when + "). If you've crossed a border since, use your phone's own emergency call.";
    numbers.forEach(function (n) { box.appendChild(link(n.number, n.label)); });
  } else {
    // Never a guessed "worldwide" number (data/locales/README.md): point to the phone's own emergency call.
    note.textContent = "Mira doesn't know which country you're in right now, so it won't guess a number. Use your phone's own emergency call: on the lock screen, tap Emergency (iPhone: SOS; Android: Emergency call).";
  }
  box.appendChild(note);
})();
