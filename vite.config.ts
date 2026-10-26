import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
const buildInfo = {
  id: new Date().toISOString(),
  builtAt: new Date().toISOString(),
};
export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(buildInfo) },
  plugins: [
    {
      name: "app-build-version",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify(buildInfo),
        });
      },
    },
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globIgnores: ["**/ocr/**", "version.json"],
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/cdn-cgi(?:\/|$)/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === self.location.origin &&
              url.pathname.startsWith("/ocr/"),
            handler: "CacheFirst",
            options: {
              cacheName: "macaniracuni-ocr-runtime-v1",
              expiration: { maxEntries: 32, maxAgeSeconds: 31536000 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      manifest: {
        name: "MacaniRacuni",
        short_name: "MacaniRacuni",
        description: "Porodična evidencija računa i skeniranje",
        theme_color: "#48216D",
        background_color: "#F4E9EF",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
});
