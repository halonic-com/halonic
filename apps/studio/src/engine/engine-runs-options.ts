// The runs options of the page's engine (`engine-service.ts`): the shell's stores, and the
// definitions, budget and trust of the workspace as last saved (`engine-saved-files.ts`).

import { TauriBlobStore, type TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { workspaceBudget } from "@halonicjs/adapter-workspace-models";
import type { assembleEngine } from "@halonicjs/engine";
import { type LoadedWorkspace, runDefinitionsOf } from "@halonicjs/workspace";
import { studioConnectorCalls } from "../connect/studio-run-connectors.ts";
import type { EngineServiceOptions, StudioRunConnectors } from "./engine-service-options.ts";
import type { StudioHarnessHost } from "./studio-harness-host.ts";

/** The executor's runs options, as the shared assembly takes them. */
type EngineRunsOptions = NonNullable<Parameters<typeof assembleEngine>[0]["executor"]["runs"]>;

/** What the engine opened for its runs, besides the service's options. */
export interface EngineRunsParts {
  readonly runStore: TauriRunStore;
  /** The workspace as last saved, which a start reads. */
  readonly latest: () => LoadedWorkspace;
  readonly connectors: StudioRunConnectors["connectors"] | undefined;
  readonly harnessHost: StudioHarnessHost | undefined;
}

/** The executor's runs options for the page's engine. */
export function engineRunsOptions(
  options: EngineServiceOptions,
  { runStore, latest, connectors, harnessHost }: EngineRunsParts,
): EngineRunsOptions {
  const { ipc, location, reportError } = options;
  return {
    store: runStore,
    blobs: new TauriBlobStore(ipc, location),
    ids: options.ids,
    definitionsOf: async (hubId, workflowId) => runDefinitionsOf(latest(), hubId, workflowId),
    budget: workspaceBudget(latest),
    // Each harness step asks again, so trust removed where this window doesn't hear it
    // (`halonic trust --remove`) still starts no harness program (HAL-12811). The trust
    // itself, not `mayStart`: a resumed run's step runs from its kept definitions, which
    // can have a harness agent the loaded workspace no longer has.
    mayStartHarness: () => options.isTrusted(latest()).catch(() => false),
    ...(connectors === undefined
      ? {}
      : {
          runConnectors: connectors,
          connectorCalls: studioConnectorCalls(location, reportError),
        }),
    ...(harnessHost === undefined
      ? {}
      : {
          harnesses: harnessHost.harnesses,
          proposalFolders: harnessHost.proposalFolders,
        }),
  };
}

/**
 * The runs the engine hasn't ended, whose proposal folders stay at the
 * host's start: those waiting for a person, and those it will end as
 * interrupted on its first run.
 */
export async function openRunsOf(runs: TauriRunStore): Promise<ReadonlySet<string>> {
  const open = await runs.list({ status: ["running", "waiting"] });
  return new Set(open.map((run) => run.id));
}
