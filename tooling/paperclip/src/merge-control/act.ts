import type { MergeAction } from "./state.ts";
import type { QueueWrite, QueueWriteClient } from "./write-client.ts";

/**
 * Carries a pass's actions out, one at a time, in the order `decide` gave
 * them, and records each result. Only `act` mode writes: in `shadow` the
 * caller passes no client at all, so not even the token is asked for. A
 * failed write is recorded and the next action still runs; a dequeue whose
 * write failed doesn't post its comment.
 */

/** Off: no pass. Shadow: decide, write nothing. Act: decide and write. */
export type MergeControlMode = "off" | "shadow" | "act";

/** What happened to one action. */
export interface ActResult {
  /** `<kind> #<number>` or `<kind> run <id>`, for the log. */
  readonly action: string;
  readonly outcome: "sent" | "shadow" | "failed" | "not-yet";
  /** The write client's error, for `failed`. */
  readonly error?: string;
}

/** The writes one action needs, in order; none for the kinds no client sends yet. */
export function writesOf(action: MergeAction, repo: string): QueueWrite[] {
  switch (action.kind) {
    case "enqueue":
      return [{ kind: "enqueue", pullId: action.pullId, head: action.head, jump: action.jump }];
    case "dequeue":
      return [
        { kind: "dequeue", pullId: action.pullId },
        { kind: "comment", repo, number: action.number, body: action.comment },
      ];
    case "rerun":
    case "rerun-failed-jobs":
    case "cancel-run":
      return [{ kind: action.kind, repo, runId: action.runId }];
    case "comment":
      return [{ kind: "comment", repo, number: action.number, body: action.body }];
    case "reopen":
      return [
        { kind: "comment", repo, number: action.number, body: action.comment },
        { kind: "close", pullId: action.pullId },
        { kind: "reopen", pullId: action.pullId },
      ];
    // The branch credential and the wake path come in later pull requests (ADR).
    case "update-branch":
    case "wake":
      return [];
  }
}

/** A short name for an action, without any text it carries. */
export function actionName(action: MergeAction): string {
  switch (action.kind) {
    case "enqueue":
      return `enqueue${action.jump ? " (jump)" : ""} #${action.number}`;
    case "dequeue":
    case "update-branch":
    case "comment":
    case "reopen":
      return `${action.kind} #${action.number}`;
    case "rerun":
    case "rerun-failed-jobs":
    case "cancel-run":
      return `${action.kind} run ${action.runId}`;
    case "wake":
      return `wake ${action.agent} on ${action.task}`;
  }
}

/** Sends one write; a reopen is tried twice, as a failed one leaves the pull request closed. */
async function sendOf(client: QueueWriteClient, write: QueueWrite): Promise<void> {
  try {
    await client.send(write);
  } catch (error) {
    if (write.kind !== "reopen") {
      throw error;
    }
    await client.send(write);
  }
}

/**
 * Runs `actions` on `repo`. Without a client (shadow mode) every action is
 * recorded as `shadow` and nothing is sent.
 */
export async function act(
  actions: readonly MergeAction[],
  options: { readonly repo: string; readonly client: QueueWriteClient | undefined },
): Promise<ActResult[]> {
  const results: ActResult[] = [];
  for (const action of actions) {
    const name = actionName(action);
    const writes = writesOf(action, options.repo);
    if (writes.length === 0) {
      results.push({ action: name, outcome: "not-yet" });
      continue;
    }
    if (options.client === undefined) {
      results.push({ action: name, outcome: "shadow" });
      continue;
    }
    try {
      for (const write of writes) {
        await sendOf(options.client, write);
      }
      results.push({ action: name, outcome: "sent" });
    } catch (error) {
      results.push({ action: name, outcome: "failed", error: (error as Error).message });
    }
  }
  return results;
}
