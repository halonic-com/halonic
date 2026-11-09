import { defineConfig } from "vite";

/**
 * Builds the Android app's own page, and only that page, into dist/connect
 * (tauri.android.conf.json loads it). It imports none of the Studio's code,
 * so the app doesn't ship the Studio (HAL-1253).
 */
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist/connect",
    emptyOutDir: true,
    rollupOptions: {
      input: "connect.html",
    },
  },
});
