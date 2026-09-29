import type { MetadataRoute } from "next";

/** Lets the dashboard be added to a home screen with the reticle icon (public/icon-*.png, full bleed). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lifelog",
    short_name: "Lifelog",
    description: "Your day, quietly noted",
    start_url: "/",
    display: "standalone",
    background_color: "#050b10",
    theme_color: "#050b10",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
