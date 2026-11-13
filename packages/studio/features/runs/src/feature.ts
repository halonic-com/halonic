import { shortRunId } from "@halonicjs/app";
import { defineFeature } from "@halonicjs/studio-shell";
import { RunsSourceService } from "./api.ts";
import { listRows } from "./list/list-rows.ts";
import { findRuns } from "./list/run-search.ts";
import { runPageWords, searchWords } from "./run-words.ts";
import { RunsList, RunsListService } from "./runs-list.ts";

/**
 * The Runs feature. It builds one {@link RunsList} per open workspace from the
 * runs the app provides (`RunsSourceService`), and adds the Runs place, whose
 * running dot in the sidebar reads that same list, and the `run` item kind,
 * one run per tab, and Home's Recent runs, whose heading counts the same
 * running runs. Ctrl K finds a run by its short id or its workflow's name (HAL-1301).
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
    studio.home.addCard({
      id: "recent-runs",
      view: "RecentRunsCard",
      load: () => import("./ui/recent-runs-card.tsx"),
      signal: (context) => context.services.get(RunsListService).signal(),
      subscribeSignal: (context, listener) =>
        context.services.get(RunsListService).subscribe(listener),
    });
    studio.search.addProvider({
      id: "runs",
      title: searchWords.title,
      order: 30,
      search: async (query, context) => {
        const list = context.services.get(RunsListService);
        if (!list.state.loaded) await list.refresh();
        return findRuns(listRows(list, new Date()), query).map((row) => ({
          item: { kind: "run", hub: row.hubId, id: row.id },
          label: searchWords.label(row.shortId, row.workflow),
          detail: searchWords.detail(row.hubId),
          description: row.line,
        }));
      },
    });
    studio.itemKinds.add({
      kind: "run",
      label: "Run",
      icon: "runs",
      place: "runs",
      open: { view: "RunPage", load: () => import("./run-view/run-page.tsx") },
      // The run page says itself when a run isn't in the workspace any more (states R22),
      // so its tab stays open.
      tab: {
        describe: (item) => ({ label: runPageWords.title(shortRunId(item.id)) }),
        exists: () => true,
      },
    });
  },
});
