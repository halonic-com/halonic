import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * Builds the page the end-to-end test opens (e2e/pages), with the kit's real CSS.
 * playwright.config.ts builds it and serves the build with `vite preview`. Only for tests;
 * nothing here ships.
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
        flow: `${import.meta.dirname}/e2e/pages/flow.html`,
        screens: `${import.meta.dirname}/e2e/pages/screens.html`,
      },
    },
  },
  preview: { host: "127.0.0.1" },
});
