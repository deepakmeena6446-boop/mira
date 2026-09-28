import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mira",
    short_name: "Mira",
    description: "Understand the way before you go, let your people follow until you arrive, and keep help one tap away if something feels wrong.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f5f1",
    theme_color: "#1d6b63",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
