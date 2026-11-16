import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import { defineFeature } from "@halonicjs/studio-shell";
import { FirstRunService, SampleWorkspaceService } from "./api.ts";
import { FirstRun } from "./first-run.ts";
import { sampleCardWords } from "./sample-text.ts";

/**
 * The First Run feature (`first-run.sample-card`). In the Acme sample it fills Home's Get set up
 * slot with the Try the sample card; in any other workspace the slot stays empty.
 */
export const firstRunFeature = defineFeature({
  id: "first-run",
  title: "First Run",
  needs: [SampleWorkspaceService, RunsListService, InboxService],
  provides: [FirstRunService],
  register(studio) {
    studio.services.provide(
      FirstRunService,
      (services) =>
        new FirstRun(services.get(RunsListService), services.get(SampleWorkspaceService)),
    );
    studio.home.addCard({
      id: "setup",
      view: "SampleCard",
      load: () => import("./ui/sample-card.tsx"),
      title: (context) =>
        context.services.get(FirstRunService).isSample ? sampleCardWords.heading : undefined,
    });
  },
});
