// How the window's engine says what it refuses: another engine holding the workspace, an agent
// the page can't start, and, for an answer to a waiting run (HAL-13318), an Approve of a
// connector's tool call, which the page can't run, and a send while another engine holds the
// workspace, which is a failure to try again, not a run that moved on.
import type { TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { shortRunId } from "@halonicjs/app";
import type { SendOptions } from "@halonicjs/ports";
import { errorKindOf, KindedError } from "@halonicjs/std";
import { definitionsOf, type LoadedWorkspace } from "@halonicjs/workspace";

/**
 * Refuses an Approve of a connector's tool call before anything is recorded, since the page starts
 * no connector: its sentence names the connector as the Library does, and its `fix` is the CLI
 * line that sends it. Any other answer passes.
 *
 * @throws KindedError `unavailable` with the CLI line as its `fix`
 */
export async function refuseConnectorApprove(
  runs: Pick<TauriRunStore, "get">,
  workspace: LoadedWorkspace,
  runId: string,
  event: string,
  options: SendOptions | undefined,
): Promise<void> {
  if (event !== "approve" || options?.callId === undefined) return;
  const run = await runs.get(runId);
  const call = run?.approvals.find((approval) => approval.callId === options.callId);
  if (run === null || call?.connector === undefined) return;
  const name = connectorNameOf(workspace, run.hubId, call.connector);
  throw new KindedError(
    "unavailable",
    `This window can't run tools from ${name} yet. To approve this one, run this in a terminal:`,
    { fix: `halonic runs send ${shortRunId(runId)} approve` },
  );
}

/**
 * The lock's `conflict` as `unavailable`, its sentence naming the other engine and what to close;
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

/** The lock's refusal as the page says it: a `conflict` names the other process, others stay as they are. */
export function lockRefusal(refusal: unknown): unknown {
  if (!(refusal instanceof KindedError) || refusal.kind !== "conflict") return refusal;
  const pid = pidOf(refusal.cause);
  const holder = pid === undefined ? "another engine" : `another engine (process ${pid})`;
  return new KindedError("conflict", `This workspace is open in ${holder}.`, {
    fix: "Close it, then try again.",
    cause: refusal,
  });
}

function pidOf(refusal: unknown): number | undefined {
  if (typeof refusal !== "object" || refusal === null) return undefined;
  const { pid } = refusal as Record<string, unknown>;
  return typeof pid === "number" ? pid : undefined;
}

/** An agent the page can't start, as `unavailable`, with the step that runs it elsewhere. */
export function pageCantStart(agentName: string, why: string, fix: string): KindedError {
  return new KindedError("unavailable", `${agentName} ${why}, which this window can't start yet.`, {
    fix,
  });
}
