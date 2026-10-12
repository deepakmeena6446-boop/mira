"use client";

/**
 * Send a live trip link with the phone's own share sheet (WhatsApp, SMS, …), falling back to
 * the clipboard. Returns what happened so the caller can say so honestly.
 */
export async function shareLiveLink(url: string, destination: string | null, mode?: string): Promise<"shared" | "cancelled" | "copied" | "failed"> {
  // Never assume walking: only a walk says "walking". No destination: she's sharing where she is.
  // Never "live": her spot is sent only while MIRA is open on her phone (audit M3-c).
  const text = destination
    ? `${mode === "walk" ? "I'm walking to" : "I'm on my way to"} ${destination}. My location on MIRA updates while I have the app open, until I arrive:`
    : "Here's where I am. My location on MIRA updates while I have the app open, while I'm sharing:";
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: "My journey on MIRA", text, url });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled"; // closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
