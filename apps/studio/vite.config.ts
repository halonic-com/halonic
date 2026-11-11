import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * Two pages, built apart so the Android app never ships the Studio (HAL-1253):
 *
 * - by default, the Android app's own page into dist/connect (tauri.android.conf.json loads it).
 *   It imports none of the Studio's code.
 * - with `--mode studio`, the Studio itself (studio.html) into dist/studio, for the desktop app
 *   and the served Studio. `pnpm studio` serves it while you work, at /studio.html.
 */
export default defineConfig(({ mode }) => {
  if (mode === "studio") {
    return {
      base: "./",
      plugins: [tailwindcss()],
      build: {
        outDir: "dist/studio",
        emptyOutDir: true,
        rollupOptions: { input: "studio.html" },
      },
    };
  }
  return {
    base: "./",
    build: {
      outDir: "dist/connect",
      emptyOutDir: true,
      rollupOptions: { input: "connect.html" },
    },
  };
});
