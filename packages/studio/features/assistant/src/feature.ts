import { defineFeature } from "@halonicjs/studio-shell";

/**
 * The Assistant feature. The Studio shell loads it by this declaration:
 * add what it needs, provides and registers here as the feature grows.
 */
export const assistantFeature = defineFeature({
  id: "assistant",
  title: "Assistant",
  register() {
    // Add this feature's pages, commands and services here.
  },
});
