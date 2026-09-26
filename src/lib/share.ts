"use client";

/**
 * Send a live trip link with the phone's own share sheet (WhatsApp, SMS, …), falling back to
 * the clipboard. Returns what happened so the caller can say so honestly.
 */
export async function shareLiveLink(url: string, destination: string): Promise<"shared" | "cancelled" | "copied" | "failed"> {
  const text = `I'm walking to ${destination}. Follow along live on MIRA until I arrive:`;
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
