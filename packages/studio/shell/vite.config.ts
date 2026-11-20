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
        "bottom-navigation": `${import.meta.dirname}/e2e/pages/bottom-navigation.html`,
        "context-menu": `${import.meta.dirname}/e2e/pages/context-menu.html`,
        "item-header": `${import.meta.dirname}/e2e/pages/item-header.html`,
        "settings-list": `${import.meta.dirname}/e2e/pages/settings-list.html`,
        "item-page-back-link": `${import.meta.dirname}/e2e/pages/item-page-back-link.html`,
        "save-problem": `${import.meta.dirname}/e2e/pages/save-problem.html`,
        "welcome-recent": `${import.meta.dirname}/e2e/pages/welcome-recent.html`,
        "overview-phone-row": `${import.meta.dirname}/e2e/pages/overview-phone-row.html`,
        "workspace-switcher": `${import.meta.dirname}/e2e/pages/workspace-switcher.html`,
        "toast-placement": `${import.meta.dirname}/e2e/pages/toast-placement.html`,
        "kept-scroll": `${import.meta.dirname}/e2e/pages/kept-scroll.html`,
        "settings-open-page": `${import.meta.dirname}/e2e/pages/settings-open-page.html`,
      },
    },
  },
  preview: { host: "127.0.0.1" },
});
