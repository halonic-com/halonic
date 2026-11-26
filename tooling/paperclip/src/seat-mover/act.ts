import type { AgentConfig, SeatApi } from "./api.ts";
import type { Move } from "./plan.ts";
import type { ParkedRun } from "./runs.ts";

/**
 * What `act` mode does for one move and for the runs a move leaves parked
 * (HAL-19354), the way the Seat Keeper does it by hand: read the agent, send
 * its whole `runtimeConfig` back with only `aiConnection` changed (Paperclip
 * replaces it whole), read it again and put `heartbeat` back if it changed.
 */

export type MoveOutcome = "moved" | "moved-heartbeat-restored" | "skipped-placement-changed";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Sends an agent's whole `runtimeConfig` back with `change` applied, reads it
 * again and puts `heartbeat` back if it changed. Answers whether it had to.
 */
export async function sendRuntimeConfig(
  api: SeatApi,
  before: AgentConfig,
  change: Record<string, unknown>,
): Promise<"sent" | "heartbeat-restored"> {
  const heartbeat = before.runtimeConfig["heartbeat"];
  await api.setRuntimeConfig(before.id, { ...before.runtimeConfig, ...change });
  const after = await api.agent(before.id);
  if (same(after.runtimeConfig["heartbeat"], heartbeat)) {
    return "sent";
  }
  await api.setRuntimeConfig(before.id, { ...after.runtimeConfig, heartbeat, ...change });
  return "heartbeat-restored";
}

/** The `aiConnection` an agent's runtimeConfig names, or an empty one. */
export function aiConnectionOf(config: AgentConfig): Record<string, unknown> {
  return (config.runtimeConfig["aiConnection"] ?? {}) as Record<string, unknown>;
}

export async function moveAgent(api: SeatApi, move: Move): Promise<MoveOutcome> {
  const before = await api.agent(move.agent.id);
  const connection = aiConnectionOf(before);
  if (connection["connectionId"] !== move.from) {
    // Someone moved it since the plan read it: the plan no longer holds for it.
    return "skipped-placement-changed";
  }
  const aiConnection = {
    ...connection,
    connectionId: move.to.connectionId,
    grantId: move.to.grantId,
  };
  const sent = await sendRuntimeConfig(api, before, { aiConnection });
  return sent === "sent" ? "moved" : "moved-heartbeat-restored";
}

/** How close a parked run's own retry may be and still be left to restart by itself. */
export const releaseIfRetryBeyondMs = 15 * 60_000;

/**
 * The parked runs to release: never started, pinned to a seat the agent no
 * longer sits on (or naming no seat, when the agent moved this pass), with
 * their retry more than 15 minutes away. (Paperclip
 * itself releases pool waits when `aiConnection` changes, server#74; this
 * catches what that leaves.)
 */
export function runsToRelease(
  parked: readonly ParkedRun[],
  seatOf: ReadonlyMap<string, string>,
  now: Date,
  movedNow: ReadonlySet<string> = new Set(),
): ParkedRun[] {
  return parked.filter((run) => {
    const current = seatOf.get(run.agentId);
    const left =
      run.connectionId === undefined
        ? movedNow.has(run.agentId)
        : current !== undefined && run.connectionId !== current;
    if (!left) {
      return false;
    }
    const retryAt = run.retryAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(run.retryAt);
    return retryAt - now.getTime() > releaseIfRetryBeyondMs;
  });
}

/** The task status a restored recovery hold may leave: Paperclip takes only these three. */
export function restoredStatus(status: string): "todo" | "in_review" | "done" {
  return status === "in_review" || status === "done" ? status : "todo";
}

/**
 * Cancels one parked run and resolves the recovery hold the cancel leaves on
 * its task, as `restored` with nothing performed. The caller wakes the task.
 */
export async function releaseRun(
  api: SeatApi,
  run: ParkedRun,
  issueStatus: string | undefined,
): Promise<void> {
  await api.cancelRun(run.id);
  if (run.issueId === undefined || issueStatus === undefined) {
    return;
  }
  const actionId = await api.recoveryActionFor(run.issueId, run.id);
  if (actionId === undefined) {
    return;
  }
  await api.resolveRecovery(run.issueId, {
    actionId,
    outcome: "restored",
    sourceIssueStatus: restoredStatus(issueStatus),
    executionReconciliation: {
      runId: run.id,
      providerStopped: true,
      actionOutcome: "not_performed",
      outcomeEvidence:
        "The seat mover cancelled this run before it started: it was parked on a seat the agent has moved off.",
    },
  });
}
