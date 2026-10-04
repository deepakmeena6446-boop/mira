import { describe, expect, it } from "vitest";
import { arrivalIntent, immediateSupportIntent, shouldSeedPlan } from "@/domain/ask-routing";
import { timeHints } from "@/domain/plan-intent";
import { answerPlanQuestion } from "@/domain/plan-ask";

/** Every phrase the 2026-10-04 audit saw answered with "Which starting place should I use?" (P0-6). */
const DISTRESS = [
  // typos and plain English (P08-003)
  "help me pls", "help plz", "pls help me now!!", "someone is folowing me", "someone is follwing me", "i'm scared what do i do", "im so scard",
  // requests Mira can't do itself (L02-001) — the support sheet has Emergency and "Tell my people"
  "call the police for me", "can you get me help", "can you alert my sister?",
  // something happened (L02-001)
  "I was harassed near the gate", "a man is staring at me", "someone groped me on the bus",
  // Hinglish and Hindi (P11-005)
  "madad karo", "help karo plz madad", "bachaoo", "darr lag raha hai", "mujhe dar lg rha h", "koi follow kar raha hai", "ek aadmi peeche aa raha hai",
  "mai khatre mein hu", "police bulao", "koi mera picha kar raha hai", "मदद चाहिए", "मुझे बहुत डर लग रहा है", "कोई पीछे आ रहा है",
];

/** Everyday questions that must keep their normal answer (the sheet would get in the way). */
const ORDINARY = [
  "can you help me find a pharmacy", "walk home from Hindu College at 10 pm", "is there a metro near here", "I'm afraid the shop closes at 9",
  "plan dinner then the way back", "what's the emergency number in Japan", "report a broken street light",
  // re-audit RA4: requests that only look urgent
  "where can I get help with my plan", "can you inform my sister when I land", "alert my mum once I reach",
];

describe("distress never gets a route question (audit P0-6)", () => {
  it.each(DISTRESS)("opens support for %j", (text) => expect(immediateSupportIntent(text)).not.toBeNull());
  it.each(ORDINARY)("leaves %j to its normal answer", (text) => expect(immediateSupportIntent(text)).toBeNull());

  it("answers non-plan text with where help is, not a starting-place question", () => {
    for (const text of ["I'm fine", "how do you use my data?", "ok thanks"]) {
      const answer = answerPlanQuestion(text, null, null).text;
      expect(answer).not.toMatch(/Which starting place/);
      expect(answer).toMatch(/I feel unsafe/);
      expect(answer).toMatch(/can't call or alert anyone/);
    }
    expect(answerPlanQuestion("walk to the metro tonight", null, null).text).toMatch(/starting place/);
  });

  it("recognises arrival said to Mira (only “I'm here” ends a journey)", () => {
    for (const text of ["I'm home", "reached", "ghar pahunch gayi", "pahuch gyi didi ko bata do", "घर पहुँच गई", "made it"]) expect(arrivalIntent(text)).toBe(true);
    for (const text of ["take me home", "walk home at 10", "when will I arrive?"]) expect(arrivalIntent(text)).toBe(false);
  });

  it("understands Hinglish and Hindi plans and times (audit P11-001)", () => {
    expect(shouldSeedPlan("kal raat 11 baje ghar jaana hai")).toBe(true);
    expect(shouldSeedPlan("मुझे मेट्रो से घर जाना है")).toBe(true);
    expect(shouldSeedPlan("ghar pahunch gayi")).toBe(false); // arrival, not a new plan
    expect(timeHints("kal raat 11 baje ghar jaana hai").timeHint).toBe("11:00 PM");
    expect(timeHints("kal raat 11 pm ghar jaana hai").timeHint).toBe("11:00 PM");
    expect(timeHints("subah 6 baje run").timeHint).toBe("6:00 AM");
    expect(timeHints("रात ११ बजे घर जाना है").timeHint).toBe("11:00 PM");
    expect(timeHints("raat 1 baje wapas").timeHint).toBe("1:00 AM");
    expect(timeHints("7 baje milna hai").timeHint).toBe("7 (AM/PM unspecified)"); // never guessed
  });
});
