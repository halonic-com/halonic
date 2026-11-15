import { defineFeature } from "@halonicjs/studio-shell";

/**
 * The Files feature. The Studio shell loads it by this declaration:
 * add what it needs, provides and registers here as the feature grows.
 */
export const filesFeature = defineFeature({
  id: "files",
  title: "Files",
  register() {
    // Add this feature's pages, commands and services here.
  },
});
