import { defineFeature } from "@halonicjs/studio-shell";
import { RunsSourceService } from "./api.ts";
import { RunsList, RunsListService } from "./runs-list.ts";

/**
 * The Runs feature. It builds one {@link RunsList} per open workspace from the
 * runs the app provides (`RunsSourceService`), and adds the Runs place, whose
 * running dot in the sidebar reads that same list. The run page, Home's
 * Recent runs and Ctrl K's run rows register here as they land (HAL-1301).
 */
export const runsFeature = defineFeature({
  id: "runs",
  title: "Runs",
  needs: [RunsSourceService],
  provides: [RunsListService],
  register(studio) {
    studio.services.provide(
      RunsListService,
      (services) => new RunsList(services.get(RunsSourceService)),
    );
    studio.places.add({
      id: "runs",
      view: "RunsPage",
      load: () => import("./ui/runs-page.tsx"),
      signal: (context) => context.services.get(RunsListService).signal(),
      subscribeSignal: (context, listener) =>
        context.services.get(RunsListService).subscribe(listener),
    });
  },
});
