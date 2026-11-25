import { defineFeature } from "@halonicjs/studio-shell";

/**
 * The Feedback feature. The Studio shell loads it by this declaration:
 * add what it needs, provides and registers here as the feature grows.
 */
export const feedbackFeature = defineFeature({
  id: "feedback",
  title: "Feedback",
  register() {
    // Add this feature's pages, commands and services here.
  },
});
