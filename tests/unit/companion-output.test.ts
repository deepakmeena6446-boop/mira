import { describe, expect, it } from "vitest";
import { allowedNumbers, companionOutputIssue, normaliseForCheck } from "@/domain/companion-output";
import { UNKNOWN_COUNTRY, capabilitiesFor, type CountryContext } from "@/domain/country-context";

describe("model output guard", () => {
  const numbers = ["999", "112"];
  it.each([
    ["Safe trip!", "safety_verdict"],
    ["This route is safe.", "safety_verdict"],
    ["I started your trip.", "invented_action"],
    ["Your contacts have been alerted.", "invented_action"],
    ["I will email your contacts.", "unsupported_promise"],
    ["Call 911 now.", "unsupported_emergency_number"],
  ])("rejects %s", (text, reason) => expect(companionOutputIssue(text, numbers)).toBe(reason));
  it("allows checked options and evidence language", () => {
    expect(companionOutputIssue("Call 999 for emergency help.", numbers)).toBeNull();
    expect(companionOutputIssue("Mapped lighting covers 68% of the walk; 32% is unknown.", numbers)).toBeNull();
  });
});

describe("safety verdicts (multilingual, normalised)", () => {
  it.each([
    "Stay safe!",
    "Get home safe x",
    "Safe travels, Priya.",
    "You'll be safe on this route.",
    "You are safe here.",
    "That area is perfectly safe at night.",
    "The route through the park is unsafe.",
    "Shoreditch can be dangerous after dark.",
    "This is the safest way home.",
    "Take the safer route along the main road.",
    "I hope you get home safely.",
    "It's a bit sketchy around there.",
    "I don't know this area but it's safe.",
    "Whether you walk or ride, you'll be safe.",
    // lookalikes and curly quotes
    "This route is ѕafe.", // Cyrillic ѕ
    "Thе аrеа is sаfе.", // Cyrillic е/а
    "You’ll be safe.",
    "Ｓａｆｅ trip!", // full-width
    "saf​e trip", // zero-width space
    // Spanish, Portuguese, French, German, Italian
    "Esta zona es segura.",
    "El barrio es peligroso de noche.",
    "A rua é perigosa.",
    "Esse caminho é seguro.",
    "Le quartier est sûr.",
    "Ce quartier est sure la nuit.",
    "C'est dangereux par ici.",
    "Vous serez en sécurité.",
    "Die Gegend ist sicher.",
    "Das ist gefährlich.",
    "La zona è sicura.",
    "Quella strada è pericolosa.",
    // Indonesian / Malay, Turkish, Hindi, Korean, Russian, Japanese, Arabic, Chinese
    "Daerah ini aman.",
    "Jalan itu berbahaya.",
    "Bu bölge güvenli.",
    "Orası tehlikeli.",
    "Yeh area surakshit hai.",
    "Woh raasta khatarnak hai.",
    "यह इलाका सुरक्षित है।",
    "यह रास्ता खतरनाक है।",
    "이 지역은 안전합니다.",
    "그 길은 위험해요.",
    "Этот район безопасен.",
    "Там опасно.",
    "この地域は安全です。",
    "その道は危険です。",
    "هذه المنطقة آمنة.",
    "هذا الطريق خطير.",
    "这个地区很安全。",
    "那条路很危险。",
    "一路平安！",
  ])("rejects %s", (text) => expect(companionOutputIssue(text, ["999"])).toBe("safety_verdict"));

  it.each([
    "I don't have enough verified information to make that judgement.",
    "I can't tell you whether this area is safe, but here are the Help Points near you.",
    "I don't know if that route is safe or not — MIRA has no crime data.",
    "I can't call any place safe or unsafe.",
    "If you're in danger right now, call 999 now and get somewhere safe with people around.",
    "Call 999 now and head somewhere with people around.",
    "The app's \"I feel unsafe\" button shows the nearest Help Point.",
    "If you feel unsafe, tap Emergency.",
    "Once you're safe, share your journey with Priya.",
    "Are you safe right now?",
    "Safety updates on Home show recent news reports for your city.",
    "Here are the Help Points near you: St Thomas' Hospital, open 24h.",
    "Mapped street lamps cover 60% of the walk; 40% is not known.",
    "Bien sûr ! Voici les pharmacies proches.",
    "No estoy segura de eso.",
    "Ich bin mir nicht sicher.",
    "Aman can follow your walk once you start.", // a name, not the Indonesian word
    "안전 업데이트는 홈에 있어요.", // "Safety updates" (noun)
    "Проверьте раздел о безопасности.", // "safety" (noun)
  ])("allows %s", (text) => expect(companionOutputIssue(text, ["999"])).toBeNull());

  it("normalises curly apostrophes, full-width forms and invisible characters", () => {
    expect(normaliseForCheck("I’ve ｎotified​")).toBe("I've notified");
  });
});

describe("invented actions and promises", () => {
  it.each([
    "I've notified Priya.",
    "I’ve notified Priya",
    "I've let Priya know you're on your way.",
    "I've shared your trip.",
    "I shared your trip with Priya.",
    "I have sent your live link.",
    "We've alerted your Circle.",
    "Priya has been notified.",
    "Your Circle has been alerted.",
    "Mum was told you're on your way.",
    "They've been emailed.",
    "Your live link was sent to Priya.",
    "Your trip has started.",
    "Trip started!",
    "Your journey is live.",
    "Priya can see you now.",
    "Priya can now follow your walk.",
    "He avisado a Priya.",
    "J'ai prévenu ta mère.",
    "Ho avvisato Priya.",
    "Ich habe Priya benachrichtigt.",
    "Maine Priya ko bata diya.",
  ])("rejects %s as a claimed action", (text) => expect(companionOutputIssue(text, ["999"])).toBe("invented_action"));

  it.each(["I'll let your Circle know.", "I'll text them.", "Mira will email your contacts.", "I'm going to notify Priya.", "Your Circle will be alerted if you're late."])("rejects %s as a promise", (text) =>
    expect(companionOutputIssue(text, ["999"])).toBe("unsupported_promise"),
  );

  it.each([
    "Tap Start to share with Priya.",
    "When you start, Priya gets a link by email.",
    "MIRA will try to email Priya your live link when you start (sending can fail).",
    "Email isn't switched on, so share your live link yourself after you start.",
    "Once your trip has started, the Trip screen has Send my live link.",
    "Nothing has been sent — you choose on the card.",
    "Nobody has been notified.",
    "Your Circle may have been alerted because the journey is past its ETA.",
    "Want me to set up the walk home? Tap the card to start.",
    "You're on your way to Home, ETA 10:40 pm.",
  ])("allows %s", (text) => expect(companionOutputIssue(text, ["999"])).toBeNull());
});

describe("emergency numbers", () => {
  it.each([
    "Call 911 now.",
    "The emergency number: 911",
    "Emergency number:911",
    "Dial 9-1-1.",
    "Ring 911 straight away.",
    "Phone 911 if you can.",
    "The police number is 100.",
    "call 1 1 2",
    "Call 9.1.1 now",
    "Call 1800-123-4567 for the helpline.",
    "911 is the emergency number here.",
    "Llama al 911.",
    "Appelez le 17.",
  ])("rejects %s", (text) => expect(companionOutputIssue(text, ["999"])).toBe("unsupported_emergency_number"));

  it("allows helplines and service numbers from the reviewed profile", () => {
    const IN: CountryContext = {
      ...UNKNOWN_COUNTRY,
      iso: "IN",
      countryName: "India",
      emergency: { ...UNKNOWN_COUNTRY.emergency, status: "PARTIALLY_VERIFIED", primary: { number: "112", label: "Emergency", scope: "unspecified" }, services: [{ number: "100", label: "Police", service: "police", scope: "service" }] },
      helplines: [{ number: "181", name: "Women helpline", hours: "24h" }],
      capabilities: capabilitiesFor("PARTIALLY_VERIFIED"),
    };
    const ok = allowedNumbers(IN);
    expect(companionOutputIssue("Call 181 for the women helpline.", ok)).toBeNull();
    expect(companionOutputIssue("Call 112, or 100 for the police.", ok)).toBeNull();
    expect(companionOutputIssue("Dial 1-1-2 now.", ok)).toBeNull();
    expect(companionOutputIssue("Call 1091 for the women helpline.", ok)).toBe("unsupported_emergency_number");
  });

  it("ignores times, distances and walking minutes", () => {
    expect(companionOutputIssue("It's 10:05 pm. Call Priya — it's a 12-minute walk, about 800 m.", ["999"])).toBeNull();
    expect(companionOutputIssue("Call 999; the pharmacy is open 24/7 and 350 metres away.", ["999"])).toBeNull();
  });
});

describe("Hinglish safety wording (owner report 2026-10-04)", () => {
  it("a refusal in Hinglish is not a verdict; a Hinglish verdict still is", () => {
    for (const t of ["Main kisi route ko safe nahi bol sakti.", "Safe hai ya nahi, ye main nahi bata sakti.", "Main safe routes judge nahi kar sakti, par plan kar sakti hoon.", "Jab tak safe feel na karo, wahin ruko."]) expect(companionOutputIssue(t, [])).toBeNull();
    for (const t of ["Ye route safe hai.", "Ye route safe nahi hai.", "Woh area khatarnak hai."]) expect(companionOutputIssue(t, [])).toBe("safety_verdict");
  });
  it("Mira's chat can skip the verdict filter but still catches a made-up emergency number", () => {
    expect(companionOutputIssue("That area is safe.", [], { checkVerdicts: false })).toBeNull();
    expect(companionOutputIssue("Call 555 0199 now.", ["112"], { checkVerdicts: false })).toBe("unsupported_emergency_number");
  });
});
