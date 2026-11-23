import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { connectPageGuard } from "./src/connect/build/connect-page-guard.ts";

/**
 * Keeps licence comments (marked `@license` or `@preserve`, or opening with `/*!`) when the build minifies, which
 * drops every other comment. The public suffix list in @halonicjs/std is MPL-2.0, and its notice
 * must reach whoever gets the app (HAL-6177). Vite's `legalComments` setting no longer does this.
 */
const output = { comments: { legal: true } };

/**
 * Two pages, built apart so the Android app never ships the desktop Studio (HAL-1253, HAL-15159):
 *
 * - by default, the Android app's own page into dist/connect (tauri.android.conf.json loads it).
 *   It takes in none of the desktop Studio, only the phone pages and the kit, and the build fails
 *   if it does, grows past its size limit or loses its content security policy (connectPageGuard).
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
        rolldownOptions: { input: "studio.html", output },
      },
    };
  }
  return {
    base: "./",
    // Tailwind builds only phone-app.css, which loads with the phone app (HAL-15985).
    plugins: [tailwindcss(), connectPageGuard()],
    build: {
      outDir: "dist/connect",
      emptyOutDir: true,
      rolldownOptions: { input: "connect.html", output },
    },
  };
});
