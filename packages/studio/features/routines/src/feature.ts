import { defineFeature } from "@halonicjs/studio-shell";

/**
 * The Routines feature. The Studio shell loads it by this declaration:
 * add what it needs, provides and registers here as the feature grows.
 */
export const routinesFeature = defineFeature({
  id: "routines",
  title: "Routines",
  register() {
    // Add this feature's pages, commands and services here.
  },
});
