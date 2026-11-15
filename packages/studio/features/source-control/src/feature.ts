import { defineFeature } from "@halonicjs/studio-shell";
import { ChangesSourceService, DeveloperViewService } from "./api.ts";
import { ChangesList, ChangesListService } from "./changes-list.ts";

/**
 * The Source Control feature: the Changes place. It builds one {@link ChangesList} per open
 * workspace from its history (`ChangesSourceService`); the sidebar's count and the page read
 * that same list, so they change together (requirement `source-control.changes-page`).
 */
export const sourceControlFeature = defineFeature({
  id: "source-control",
  title: "Changes",
  needs: [ChangesSourceService],
  wants: [DeveloperViewService],
  provides: [ChangesListService],
  register(studio) {
    studio.services.provide(
      ChangesListService,
      (services) => new ChangesList(services.get(ChangesSourceService)),
    );
    studio.places.add({
      id: "changes",
      view: "ChangesPage",
      load: () => import("./ui/changes-page.tsx"),
      signal: (context) => context.services.get(ChangesListService).signal(),
      subscribeSignal: (context, listener) =>
        context.services.get(ChangesListService).subscribe(listener),
    });
  },
});
