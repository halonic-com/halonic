import { AgentsHostService } from "@halonicjs/studio-feature-agents/api";
import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import {
  ModelKeysService,
  ModelsFilesService,
  ProviderCheckService,
} from "@halonicjs/studio-feature-models/api";
import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import { WorkflowGuideService } from "@halonicjs/studio-feature-workflows/api";
import { defineFeature } from "@halonicjs/studio-shell";
import { FirstRunDeviceService, FirstRunService, SampleWorkspaceService } from "./api.ts";
import { FirstRun } from "./first-run.ts";
import { firstRunGuide } from "./first-run-guide.ts";
import { firstRunHelpItems } from "./first-run-help.ts";
import { firstRunSetupSource } from "./first-run-setup.ts";
import { helpWords } from "./first-run-words.ts";

/**
 * The First Run feature (`first-run.state`): the first run's state on this device, the first-run
 * bar under the top bar (`first-run.bar`) and the guide card on Support reply's page
 * (`first-run.guide-card`), from **Open demo** until the first win, the Inbox's setup item
 * of a paused first run (`first-run.setup-item`), **Help › First run** (`first-run.help`), and
 * Home's Get set up in a workspace that isn't the sample (`first-run.own-card`).
 */
export const firstRunFeature = defineFeature({
  id: "first-run",
  title: "First Run",
  needs: [SampleWorkspaceService, FirstRunDeviceService, RunsListService],
  // A paused first run has a setup item in the Inbox, where there is one. Get set up reads the
  // agents and the model files where the app has them, and a key or a check to judge step 1.
  wants: [
    InboxService,
    AgentsHostService,
    ModelsFilesService,
    ModelKeysService,
    ProviderCheckService,
  ],
  provides: [FirstRunService, WorkflowGuideService],
  register(studio) {
    studio.services.provide(FirstRunService, (services) => {
      const firstRun = new FirstRun(
        services.get(RunsListService),
        services.get(SampleWorkspaceService),
        services.get(FirstRunDeviceService),
        () => new Date(),
      );
      services.find(InboxService)?.addSetupSource(firstRunSetupSource(firstRun));
      return firstRun;
    });
    studio.services.provide(WorkflowGuideService, (services) =>
      firstRunGuide(services.get(FirstRunService)),
    );
    studio.strips.add({
      id: "first-run.bar",
      order: 10,
      view: "FirstRunBar",
      load: () => import("./ui/first-run-bar.tsx"),
    });
    studio.home.addCard({
      id: "setup",
      view: "OwnCard",
      load: () => import("./ui/own-card.tsx"),
    });
    studio.help.add({
      id: "first-run.help",
      order: 20,
      title: helpWords.title,
      items: (context) =>
        firstRunHelpItems(context.services.get(FirstRunService), context.openItem),
      subscribe: (context, listener) => context.services.get(FirstRunService).subscribe(listener),
    });
  },
});
