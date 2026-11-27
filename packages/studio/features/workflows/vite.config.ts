import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * Builds the pages the end-to-end tests open (e2e/pages), with the kit's real CSS.
 * playwright.config.ts builds them and serves the build with `vite preview`. Only for tests;
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
        "run-card": `${import.meta.dirname}/e2e/pages/run-card.html`,
        "sandbox-choice": `${import.meta.dirname}/e2e/pages/sandbox-choice.html`,
        "sandbox-setup": `${import.meta.dirname}/e2e/pages/sandbox-setup.html`,
        "run-steps": `${import.meta.dirname}/e2e/pages/run-steps.html`,
        approval: `${import.meta.dirname}/e2e/pages/approval.html`,
        "plan-limit": `${import.meta.dirname}/e2e/pages/plan-limit.html`,
        "agent-card": `${import.meta.dirname}/e2e/pages/agent-card.html`,
        "item-pictures": `${import.meta.dirname}/e2e/pages/item-pictures.html`,
        settings: `${import.meta.dirname}/e2e/pages/settings.html`,
        "agents-list": `${import.meta.dirname}/e2e/pages/agents-list.html`,
        welcome: `${import.meta.dirname}/e2e/pages/welcome.html`,
        canvas: `${import.meta.dirname}/e2e/pages/canvas.html`,
        "agent-map": `${import.meta.dirname}/e2e/pages/agent-map.html`,
        configuration: `${import.meta.dirname}/e2e/pages/configuration.html`,
        "allow-address": `${import.meta.dirname}/e2e/pages/allow-address.html`,
        "spend-and-seats": `${import.meta.dirname}/e2e/pages/spend-and-seats.html`,
        "pull-requests": `${import.meta.dirname}/e2e/pages/pull-requests.html`,
        "update-button": `${import.meta.dirname}/e2e/pages/update-button.html`,
        "first-run-polish": `${import.meta.dirname}/e2e/pages/first-run-polish.html`,
      },
    },
  },
  preview: { host: "127.0.0.1" },
});
