// The start of a run whose definitions the host has read: the steps between
// reading them and the run's first recorded event.

import type { BlobStore, RunStore, StartRunRequest } from "@halonicjs/ports";
import type { DecideInput, RunDefinitions } from "../kernel/decide-types.ts";
import { InputRefused } from "../kernel/input-refused.ts";
import { keepDefinitions } from "../kernel/kept-definitions.ts";
import type { RunsProposalFolders } from "./proposal-folders.ts";
import { startInputOf } from "./start-request.ts";

/** What {@link recordStart} works with. */
export interface RecordStartPorts {
  readonly blobs: BlobStore;
  readonly store: RunStore;
  readonly folders: RunsProposalFolders;
  /** Records the input for the run, and carries out what it causes. */
  readonly record: (runId: string, input: DecideInput) => Promise<unknown>;
  readonly now: () => string;
}

/**
 * Keeps the definitions, opens the run's proposal folder and records the
 * start. A start repeated at the same moment records nothing: the other one did.
 *
 * @throws when the definitions can't be kept, the folder can't be opened or the start can't be recorded
 */
export async function recordStart(
  ports: RecordStartPorts,
  request: StartRunRequest,
  runId: string,
  definitions: RunDefinitions,
): Promise<void> {
  const { hubId, workflowId, harness, version } = request;
  const definitionsVersion = await keepDefinitions(ports.blobs, definitions);
  const folderRun = { runId, hubId, workflowId, version: version ?? null };
  const opened = await ports.folders.open(folderRun, definitions, harness);
  try {
    await ports.record(runId, startInputOf(request, runId, definitionsVersion, ports.now()));
  } catch (error) {
    if (error instanceof InputRefused && error.code === "engine.run-exists") return;
    if (opened && (await ports.store.get(runId)) === null) {
      await ports.folders.notStarted(runId);
    }
    throw error;
  }
}
