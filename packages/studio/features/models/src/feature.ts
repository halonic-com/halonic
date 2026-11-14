import { defineFeature } from "@halonicjs/studio-shell";

/**
 * The Models feature: providers, aliases, API keys, budget, the "Prices and
 * budget" step and the spend line. Each part registers here as it lands; the
 * interface other features use is in `api.ts`.
 */
export const modelsFeature = defineFeature({
  id: "models",
  title: "Models",
  register() {},
});
