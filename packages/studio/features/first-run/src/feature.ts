import { AgentsHostService } from "@halonicjs/studio-feature-agents/api";
import { AskKeysTextService } from "@halonicjs/studio-feature-feedback/api";
import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import {
  ModelKeysService,
  ModelsFilesService,
  ProviderCheckService,
} from "@halonicjs/studio-feature-models/api";
import { RunStartHostService, RunsListService } from "@halonicjs/studio-feature-runs/api";
import { WorkflowGuideService } from "@halonicjs/studio-feature-workflows/api";
import { defineFeature } from "@halonicjs/studio-shell";
import {
  FirstRunDeviceService,
  FirstRunService,
  ModelChoiceHostService,
  SampleWorkspaceService,
} from "./api.ts";
import { FirstRun } from "./first-run.ts";
import { firstRunGuide } from "./first-run-guide.ts";
import { firstRunHelpItems } from "./first-run-help.ts";
import { firstRunSetupSource } from "./first-run-setup.ts";
import { FirstRunStart, FirstRunStartService } from "./first-run-start.ts";
import { helpWords } from "./first-run-words.ts";
import { servedModelsWords } from "./served-models/served-models-words.ts";
import { youDidItSource, youDidItView } from "./you-did-it.ts";

/**
 * The First Run feature (`first-run.state`): the first run's state on this device, the first-run
 * bar under the top bar (`first-run.bar`) and the guide card on Support reply's page
 * (`first-run.guide-card`), from **Open demo** until the first win, "You did it" in the Inbox
 * after it (`first-run.you-did-it`), the Inbox's setup item
 * of a paused first run (`first-run.setup-item`), **Help › First run** (`first-run.help`), and
 * Home's Get set up in a workspace that isn't the sample (`first-run.own-card`).
 */
export const firstRunFeature = defineFeature({
  id: "first-run",
  title: "First Run",
  needs: [SampleWorkspaceService, FirstRunDeviceService, RunsListService],
  // A paused first run has a setup item in the Inbox, where there is one. Get set up reads the
  // agents and the model files where the app has them, and a key or a check to judge step 1.
  // The run starts and cancels where the app has an engine, and Pick a model saves a choice
  // where it has files. "You did it" names quick ask's keys where they work.
  wants: [
    InboxService,
    AskKeysTextService,
    AgentsHostService,
    ModelsFilesService,
    ModelKeysService,
    ProviderCheckService,
    RunStartHostService,
    ModelChoiceHostService,
  ],
  provides: [FirstRunService, FirstRunStartService, WorkflowGuideService],
  register(studio) {
    studio.services.provide(FirstRunService, (services) => {
      const firstRun = new FirstRun(
        services.get(RunsListService),
        services.get(SampleWorkspaceService),
        services.get(FirstRunDeviceService),
        () => new Date(),
      );
      const inbox = services.find(InboxService);
      inbox?.addSetupSource(firstRunSetupSource(firstRun));
      const view = youDidItView(services.get(RunsListService), services.find(AskKeysTextService));
      inbox?.addAnsweredView(youDidItSource(firstRun, view));
      return firstRun;
    });
    studio.services.provide(
      FirstRunStartService,
      (services) =>
        new FirstRunStart(services.get(FirstRunService), services.find(RunStartHostService)),
    );
    studio.services.provide(WorkflowGuideService, (services) => {
      const parts = {
        firstRun: services.get(FirstRunService),
        start: services.get(FirstRunStartService),
        service: services.find(ModelChoiceHostService),
      };
      return firstRunGuide(parts.firstRun, parts.start, {
        view: "PickModelPage",
        load: async () => {
          const { pickModelPageOf } = await import("./ui/pick-model-page.tsx");
          return { PickModelPage: pickModelPageOf(parts) };
        },
      });
    });
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

/**
 * The First Run feature of a served window (`first-run.served-models`): only Settings › Models,
 * whose Model row opens Pick a model (HAL-16248, option A), since a served window has no runs to
 * start the first run from. Register it in place of {@link firstRunFeature}, never with it.
 */
export const servedFirstRunFeature = defineFeature({
  id: "first-run",
  title: "First Run",
  needs: [ModelChoiceHostService],
  register(studio) {
    studio.settings.add({
      id: "models",
      icon: "models",
      title: servedModelsWords.title,
      scope: "workspace",
      order: 10,
      view: "ServedModelsSection",
      load: () => import("./ui/served-models-section.tsx"),
    });
  },
});
