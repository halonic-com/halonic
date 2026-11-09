import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * Serves the kit's states page (`pnpm states`): every part in every state, for design review and
 * for the screenshots in each kit pull request. Only for development; nothing here ships.
 *
 * The tests don't use this file: they run from vitest.config.ts, which Vitest reads first.
 */
export default defineConfig({
  root: `${import.meta.dirname}/states`,
  plugins: [tailwindcss()],
  server: { host: "127.0.0.1" },
});
