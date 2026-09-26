import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // postgres.js and nodemailer are server-only runtime dependencies.
  serverExternalPackages: ["postgres", "nodemailer"],
  logging: {
    // Dev request logs must never contain invitation bearer tokens.
    incomingRequests: { ignore: [/^\/invite\//, /^\/t\//, /^\/api\/t\//, /^\/auth\/link\//] },
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        // Location only on explicit tap (same origin). No microphone/camera: V0 ships text-only input.
        value: "geolocation=(self), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    return [
      { source: "/:path*", headers: common },
      // Invitation landing and page: never leak the URL via Referer.
      { source: "/invite", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/invite/:token*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/auth/link/:token*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex" }] },
      { source: "/t/:token*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex" }] },
      // The static offline page (served by the service worker) gets a fixed policy: same-origin script only, no inline.
      {
        source: "/offline.html",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" }],
      },
    ];
  },
};

export default nextConfig;
