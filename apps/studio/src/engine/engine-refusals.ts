// How the window's engine refuses an answer to a waiting run (HAL-13318): an Approve of a
// connector's tool call the window can't run, and a send while another engine holds the
// workspace, which is a failure to try again, not a run that moved on.
import type { TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { shortRunId } from "@halonicjs/app";
import { readRun } from "@halonicjs/engine";
import type { SendOptions } from "@halonicjs/ports";
import { errorKindOf, KindedError } from "@halonicjs/std";
import { definitionsOf, type LoadedWorkspace } from "@halonicjs/workspace";

/** What {@link refuseConnectorApprove} reads. */
export interface ConnectorApproveInput {
  readonly runs: Pick<TauriRunStore, "get" | "events" | "snapshot">;
  readonly workspace: LoadedWorkspace;
  /** Whether an agent host starts the runs' `stdio` connectors in this window (`PageRuns`). */
  readonly startsConnectors: boolean;
}

/**
 * Refuses, before anything is recorded, an Approve of a connector's tool call the window can't
 * make: where no agent host starts connectors, or in a run that read a commit (one the CLI
 * started), since the page starts connectors only on the saved files (`studioRunConnectors`).
 * Its sentence names the connector as the Library does, and its `fix` is the CLI line that sends
 * it. Any other answer passes.
 *
 * @throws KindedError `unavailable` with the CLI line as its `fix`
 */
export async function refuseConnectorApprove(
  { runs, workspace, startsConnectors }: ConnectorApproveInput,
  runId: string,
  event: string,
  options: SendOptions | undefined,
): Promise<void> {
  if (event !== "approve" || options?.callId === undefined) return;
  const run = await runs.get(runId);
  const call = run?.approvals.find((approval) => approval.callId === options.callId);
  if (run === null || call?.connector === undefined) return;
  if (startsConnectors) {
    // A child run keeps its parent's version, so the run's own is the one its connectors read.
    const state = await readRun(runs, runId);
    if (state?.version?.reads === "saved-files") return;
  }
  const name = connectorNameOf(workspace, run.hubId, call.connector);
  throw new KindedError(
    "unavailable",
    `This window can't run tools from ${name} yet. To approve this one, run this in a terminal:`,
    { fix: `halonic runs send ${shortRunId(runId)} approve` },
  );
}

/**
 * The lock's `conflict` as `unavailable`, its sentence naming the other engine and what to stop;
 * any other error as it is.
 */
export function answerRefusalOf(error: unknown): unknown {
  if (!(error instanceof KindedError) || errorKindOf(error) !== "conflict") return error;
  return new KindedError("unavailable", `${error.message} ${error.fix ?? ""}`.trim(), {
    cause: error,
  });
}

/**
 * A connector's name as the Library shows it: its `name`, else its id, also when the hub or the
 * connector is gone from the workspace since the run started.
 */
function connectorNameOf(workspace: LoadedWorkspace, hubId: string, id: string): string {
  try {
    return definitionsOf(workspace, hubId).connectors[id]?.name ?? id;
  } catch {
    return id;
  }
}
