import { defineFeature } from "@halonicjs/studio-shell";

/**
 * The Agents feature. The Studio shell loads it by this declaration:
 * add what it needs, provides and registers here as the feature grows.
 */
export const agentsFeature = defineFeature({
  id: "agents",
  title: "Agents",
  register() {
    // Add this feature's pages, commands and services here.
  },
});
