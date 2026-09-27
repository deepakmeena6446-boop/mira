import { ImageResponse } from "next/og";

// Link previews (WhatsApp, Instagram…). Generic on purpose: live-trip links use it too, so it
// never carries a name, place or anything personal.
export const alt = "MIRA — with you until you arrive";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 96px", background: "linear-gradient(135deg, #faf7ff 0%, #efe9ff 55%, #fff0e9 100%)", color: "#1c1633", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 88, height: 88, borderRadius: 44, background: "linear-gradient(135deg, #6a44f5, #ff8a65)" }} />
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>MIRA</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>With you until you arrive.</div>
        <div style={{ marginTop: 28, fontSize: 34, color: "#5a546e", lineHeight: 1.3 }}>Understand the way, let your people follow until you arrive, and keep help one tap away.</div>
      </div>
    ),
    size,
  );
}
