import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mira",
    short_name: "Mira",
    description: "Know a place, move with support, and help the next person with trusted local safety information.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff7ef",
    theme_color: "#17665b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
