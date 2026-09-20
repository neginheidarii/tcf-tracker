import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "TCF Canada Tracker",
        short_name: "TCF",
        description: "A study tracker for the TCF Canada exam.",
        start_url: "/",
        display: "standalone",
        background_color: "#FDF9FB",
        theme_color: "#FDF9FB",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        /* The shell is cached so the app opens with no connection; data comes
           from the local cache in storage, never from cached API responses. */
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/auth/, /^\/rest/],
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
