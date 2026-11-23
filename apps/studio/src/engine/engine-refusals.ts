// How the window's engine refuses an answer to a waiting run (HAL-13318): an Approve of a
// connector's tool call the window can't run, and a send while another engine holds the
// workspace or a run is going, which is a failure to try again, not a run that moved on.
import type { TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { shortRunId } from "@halonicjs/app";
import { readRun } from "@halonicjs/engine";
import type { SendOptions } from "@halonicjs/ports";
import { errorKindOf, KindedError } from "@halonicjs/std";
import { TryAgainLater } from "@halonicjs/studio-shell";
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
 * make: where no agent host starts connectors, in a run that records no version it read, and
 * from a connector that isn't a `stdio` one of the run's hub, the only kind it starts
 * (HAL-14847), as the page's start refusal tests (`page-refusal.ts`). Its sentence names the connector as the Library does, and its `fix` is the CLI line that sends
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
    // The saved files or a commit: the page starts either's connectors (`studioRunConnectors`).
    if (
      state?.version !== undefined &&
      state.version !== null &&
      startsStdio(workspace, run.hubId, call.connector)
    ) {
      return;
    }
  }
  const name = connectorNameOf(workspace, run.hubId, call.connector);
  throw new KindedError(
    "unavailable",
    `Studio can't run tools from ${name} yet. To approve this one, run this in a terminal:`,
    { fix: `halonic runs send ${shortRunId(runId)} approve` },
  );
}

/**
 * The lock's `conflict` as `unavailable`, its sentence naming the other engine and what to stop,
 * and a {@link TryAgainLater}, such as Local only turned on while a run was going, with its next
 * step in the one sentence too: the Inbox shows only the sentence (C701 row 5). Any other error as
 * it is.
 */
export function answerRefusalOf(error: unknown): unknown {
  if (!(error instanceof KindedError)) return error;
  if (errorKindOf(error) !== "conflict" && !(error instanceof TryAgainLater)) return error;
  return new KindedError("unavailable", `${error.message} ${error.fix ?? ""}`.trim(), {
    cause: error,
  });
}

/** Whether `id` is a `stdio` connector of the hub `hubId`, also false when either is gone. */
function startsStdio(workspace: LoadedWorkspace, hubId: string, id: string): boolean {
  try {
    const { connectors } = definitionsOf(workspace, hubId);
    const connector = Object.hasOwn(connectors, id) ? connectors[id] : undefined;
    return connector !== undefined && "stdio" in connector.transport;
  } catch {
    return false;
  }
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
