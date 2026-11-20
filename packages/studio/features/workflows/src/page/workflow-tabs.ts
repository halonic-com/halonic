import type { Tab } from "@halonicjs/studio-kit";
import { configurationWords } from "../configuration/configuration-words.ts";
import { runsWords } from "../runs/runs-words.ts";

/** The workflow page's tabs. */
export type WorkflowView = "flow" | "configuration" | "runs";

/** The page's tabs: Flow, Configuration with its error count, and Runs with the count of runs that need you. */
export function workflowTabs(errors: number, needYou: number): readonly Tab<WorkflowView>[] {
  return [
    { id: "flow", label: configurationWords.flowTab },
    {
      id: "configuration",
      label: configurationWords.tab,
      ...(errors > 0 && {
        count: {
          value: errors,
          tone: "danger" as const,
          name: configurationWords.errors(errors),
        },
      }),
    },
    {
      id: "runs",
      label: runsWords.tab,
      ...(needYou > 0 && {
        count: { value: needYou, tone: "warning" as const, name: runsWords.needYou(needYou) },
      }),
    },
  ];
}
