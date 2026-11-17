import { defineFeature } from "@halonicjs/studio-shell";
import { RoutinesHostService } from "./api.ts";
import { listWords } from "./list/list-words.ts";
import { requestNewRoutine } from "./list/new-request.ts";

/**
 * The Routines feature: the Routines list with its New routine dialog. The `routine` item kind and
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
    studio.commands.add({
      id: "routines.new",
      title: listWords.newRoutine,
      run: (context) => {
        if (context.openPlace === undefined) return;
        requestNewRoutine();
        context.openPlace("routines");
      },
    });
  },
});
