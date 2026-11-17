import { defineFeature } from "@halonicjs/studio-shell";
import { RoutinesHostService } from "./api.ts";

/**
 * The Routines feature: the Routines list. The New routine dialog, the `routine` item kind and
 * its page, Ctrl K search, Delete and Run now, and the Triggers sections land in the next pull
 * requests; the interface other features use is in `api.ts`.
 */
export const routinesFeature = defineFeature({
  id: "routines",
  title: "Routines",
  needs: [RoutinesHostService],
  register(studio) {
    studio.places.add({
      id: "routines",
      view: "RoutinesPage",
      load: () => import("./list/routines-page.tsx"),
    });
  },
});
