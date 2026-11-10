import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * Builds the pages the end-to-end tests open (e2e/pages), one per part under test, with the kit's
 * real CSS. playwright.config.ts builds them and serves the build with `vite preview`. Only for
 * tests; nothing here ships.
 *
 * The unit tests don't use this file: they run from vitest.config.ts, which Vitest reads first.
 */
export default defineConfig({
  root: `${import.meta.dirname}/e2e/pages`,
  plugins: [tailwindcss()],
  build: {
    outDir: `${import.meta.dirname}/dist/e2e`,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "tab-strip": `${import.meta.dirname}/e2e/pages/tab-strip.html`,
      },
    },
  },
  preview: { host: "127.0.0.1" },
});
