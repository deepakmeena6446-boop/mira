import { ImageResponse } from "next/og";

// Link previews (WhatsApp, Instagram…). Generic on purpose: live-trip links use it too, so it
// never carries a name, place or anything personal.
export const alt = "Mira — step out with confidence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 96px", background: "#f6f5f1", color: "#1a1a18", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 72, height: 72, borderRadius: 36, border: "6px solid #1d6b63", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 26, height: 26, borderRadius: 13, background: "#1d6b63" }} /></div>
          <div style={{ fontSize: 60, fontWeight: 600, letterSpacing: -1 }}>Mira</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 72, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>Step out with confidence.</div>
        <div style={{ marginTop: 28, fontSize: 34, color: "#55534d", lineHeight: 1.3 }}>Know what matters where you’re going, and what you can do next — with every source and limit shown.</div>
      </div>
    ),
    size,
  );
}
