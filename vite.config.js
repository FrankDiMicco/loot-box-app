import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative asset URLs so the build works at the GitHub Pages project
  // subpath (/loot-box-app/) without hardcoding it. The service worker
  // scope resolves relative to the registration document, so this works
  // at both the subpath (prod) and the root (vite preview / localhost).
  base: './',
  plugins: [
    react(),
    VitePWA({
      // A new deploy's service worker takes over on the next load — no stale
      // code, and no update-prompt UI to clutter the app (skipWaiting +
      // clientsClaim under the hood).
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Keep the hand-written public/manifest.json (already linked in
      // index.html with the real icons); the plugin only manages the SW.
      manifest: false,
      workbox: {
        // Precache the app shell: hashed JS/CSS, index.html, icons, and the
        // now-tiny box/UI art. Everything here loads offline.
        globPatterns: ['**/*.{js,css,html,webp,png,svg,ico,woff2,json}'],
        // Single-page app: serve the cached index.html for any navigation.
        navigateFallback: 'index.html',
        // Firestore reads must always hit the network (it has its own cache);
        // don't let the SW intercept API calls — no runtime rule matches them,
        // so they pass straight through.
        runtimeCaching: [
          {
            // Google Fonts stylesheet
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // Google Fonts webfont files
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Firebase compat SDK (gstatic) + QRCode (cdnjs) — cache so the
            // shell boots offline. gstatic also serves fonts, so scope this
            // to the firebasejs path only.
            urlPattern: /^https:\/\/(www\.gstatic\.com\/firebasejs|cdnjs\.cloudflare\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-libs',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // Serve the SW in dev too so it can be exercised without a full build.
      devOptions: { enabled: false },
    }),
  ],
});
