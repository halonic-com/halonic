// What one load of a workspace's files says about its runs, kept apart from `WorkspaceRuns`, which
// reads the runs themselves.

import { defaultCurrency, type HubWorkflow, hubWorkflows, testModelsOf } from "@halonicjs/app";
import { type RoutineClock, routineClocks } from "@halonicjs/app/routines";
import type { ProviderKind } from "@halonicjs/studio-feature-runs/api";
import { filesOf, type LoadedWorkspace, providerIsLocal } from "@halonicjs/workspace";

/** What the workspace's files say about its runs. */
export interface WorkspaceFacts {
  /** The files as read, for the models of a hub's runs. */
  readonly workspace: LoadedWorkspace;
  readonly workflows: readonly HubWorkflow[];
  /** By key, the `trigger.routineId` of the runs each starts. */
  readonly routines: ReadonlyMap<string, RoutineClock>;
  /** By id, where each provider the workspace has runs. */
  readonly providers: ReadonlyMap<string, ProviderKind>;
  /** The ids of the providers whose file says `type: mock`, the test model. */
  readonly testModels: ReadonlySet<string>;
  /** By id, the `name` of each provider whose file gives one. */
  readonly providerNames: ReadonlyMap<string, string>;
  /** By id, each agent's name as its file says. */
  readonly agentNames: ReadonlyMap<string, string>;
  /** By id, each hub's name as its file says. */
  readonly hubNames: ReadonlyMap<string, string>;
  readonly currency: string;
  readonly monthly: number | undefined;
}

/** The facts one loaded workspace gives about its runs. */
export function workspaceFactsOf(workspace: LoadedWorkspace): WorkspaceFacts {
  const settings = filesOf(workspace, "workspace")[0]?.value;
  return {
    workspace,
    workflows: hubWorkflows(workspace),
    routines: routineClocks(workspace),
    providers: new Map(
      filesOf(workspace, "provider").map(({ value }) => [
        value.id,
        providerIsLocal(value) ? "local" : "cloud",
      ]),
    ),
    testModels: testModelsOf(workspace),
    providerNames: new Map(
      filesOf(workspace, "provider").flatMap(({ value }) =>
        value.name === undefined ? [] : [[value.id, value.name] as const],
      ),
    ),
    agentNames: new Map(
      filesOf(workspace, "agent")
        .toReversed()
        .map(({ value }) => [value.id, value.name]),
    ),
    hubNames: new Map(filesOf(workspace, "hub").map(({ value }) => [value.id, value.name])),
    currency: settings?.budget?.currency ?? defaultCurrency,
    monthly: settings?.budget?.monthly,
  };
}
