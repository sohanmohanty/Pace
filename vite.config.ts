/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Respect the PORT env var (used by preview tooling); default to 5173.
  server: { port: Number(process.env.PORT) || 5173 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Pace — student re-entry planner",
        short_name: "Pace",
        description:
          "A capacity-aware planner that helps students restart after invisible disruptions. Local-first: your data stays on your device.",
        theme_color: "#0e7268",
        background_color: "#f6f4ef",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      }
    })
  ],
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"]
  }
});
