import { sandboxStartCheckKey } from "@halonicjs/app";
import {
  AgentsHostService,
  stepsToSelect,
  WHERE_IT_RUNS_STEP,
} from "@halonicjs/studio-feature-agents/api";
import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import {
  openModelsOf,
  RunsListService,
  RunsSourceService,
} from "@halonicjs/studio-feature-runs/api";
import { engineWordsOf, FilesWithErrorsService, type ItemViewProps } from "@halonicjs/studio-shell";
import { RUN_FORM_STEP, WorkflowGuideService, WorkflowsHostService } from "../api.ts";
import { openFileAtLine } from "./blocking-file.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

/** The command that opens the workspace page at its Budget block (`features/workspace`). */
const openBudgetCommand = "workspace.open-budget";

/** The workflow's page in its tab: `item` names the workflow, the host gives its steps. */
export function WorkflowPage({ item, context, step, asked }: ItemViewProps) {
  const { openItem, openPlace } = context;
  const outline = stepsToSelect(step);
  const runsList = context.services.get(RunsListService);
  const openModels = openModelsOf(context);
  return (
    <WorkflowScreen
      host={context.services.get(WorkflowsHostService)}
      runs={context.services.get(RunsSourceService)}
      hubId={item.hub}
      id={item.id}
      {...(step === "tests" && { startOnTests: true, testsAsked: asked ?? 0 })}
      {...(step === RUN_FORM_STEP && { runFormAsked: asked ?? 0 })}
      {...(outline && { outline, outlineAsked: asked ?? 0 })}
      notAnswering={engineWordsOf(context).notAnswering}
      announceState={(key, text) => context.announcer.announceState(key, text)}
      announce={(line) => context.announcer.announce(line)}
      {...(openModels && { openModels })}
      saving={context.saving}
      sandboxStartCheck={context.services.find(sandboxStartCheckKey)}
      agents={context.services.find(AgentsHostService)}
      guide={context.services.find(WorkflowGuideService)}
      {...(context.runCommand && {
        openBudget: () => void context.runCommand?.(openBudgetCommand),
      })}
      shownRuns={context.services.find(InboxService)?.shownRuns}
      filesWithErrors={context.services.find(FilesWithErrorsService)}
      {...(openItem && {
        openRun: (runId: string, step?: string) =>
          openItem({ kind: "run", hub: item.hub, id: runId }, step === undefined ? {} : { step }),
        openAgent: (agentId: string) => openItem({ kind: "agent", hub: item.hub, id: agentId }),
        reviewAndConfirm: (agentId: string) =>
          openItem({ kind: "agent", hub: item.hub, id: agentId }, { step: WHERE_IT_RUNS_STEP }),
        openFileAt: openFileAtLine(openItem),
      })}
      {...(openPlace && {
        goToWorkflows: () => openPlace("workflows"),
        reviewInInbox: (runId: string) => {
          runsList.reviewInInbox(runId);
          openPlace("inbox");
        },
        seeAllRuns: () => {
          runsList.showWorkflow({ hubId: item.hub, id: item.id });
          openPlace("runs");
        },
      })}
    />
  );
}
