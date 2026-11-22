// The runs options of the page's engine (`engine-service.ts`): the shell's stores, each run's
// definitions from the version it records (`page-run-versions.ts`, HAL-14229), and the budget and
// trust of the version a start last read (`engine-saved-files.ts`).

import { TauriBlobStore, type TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { workspaceBudget } from "@halonicjs/adapter-workspace-models";
import type { assembleEngine } from "@halonicjs/engine";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { studioConnectorCalls } from "../connect/studio-run-connectors.ts";
import type { EngineServiceOptions, StudioRunConnectors } from "./engine-service-options.ts";
import { refuseUntrusted } from "./engine-trust.ts";
import type { PageRunVersions } from "./page-run-versions.ts";
import type { StudioHarnessHost } from "./studio-harness-host.ts";

/** The executor's runs options, as the shared assembly takes them. */
type EngineRunsOptions = NonNullable<Parameters<typeof assembleEngine>[0]["executor"]["runs"]>;

/** What the engine opened for its runs, besides the service's options. */
export interface EngineRunsParts {
  readonly runStore: TauriRunStore;
  /** The version a start last read, which the budget and the harness trust read. */
  readonly latest: () => LoadedWorkspace;
  /** The versions runs start from, which each run's definitions come from. */
  readonly runVersions: Pick<PageRunVersions, "definitionsOf">;
  readonly connectors: StudioRunConnectors["connectors"] | undefined;
  readonly harnessHost: StudioHarnessHost | undefined;
}

/** The executor's runs options for the page's engine. */
export function engineRunsOptions(
  options: EngineServiceOptions,
  { runStore, latest, runVersions, connectors, harnessHost }: EngineRunsParts,
): EngineRunsOptions {
  const { ipc, location, reportError } = options;
  return {
    store: runStore,
    blobs: new TauriBlobStore(ipc, location),
    ids: options.ids,
    // From the version the run records, checked for trust on that load.
    definitionsOf: (hubId, workflowId, version, runId) =>
      runVersions.definitionsOf({ hubId, workflowId, runId }, version, (loaded) =>
        refuseUntrusted(options.mayStart, loaded),
      ),
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
