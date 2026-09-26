import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MIRA",
    short_name: "MIRA",
    description: "Lighting and Help Points on your route, your journey shared live in one tap, and help close at hand.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf7ff",
    theme_color: "#6a44f5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
