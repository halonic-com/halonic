import type { RunSummary } from "@halonicjs/events";
import type { RunExecutor, SendOptions } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import type { RunItem, WaitItem } from "./inbox-items.ts";

/** Your answers to the Inbox's run items, sent to the runs that wait for them. A setup item takes none. */
export interface InboxDecisions {
  /** Approve: the tool runs, or the wait step moves on its `approve` transition. */
  approve(item: RunItem): Promise<RunSummary>;
  /** Reject: the tool call doesn't run and the agent is told; a wait step moves on `reject`. */
  reject(item: RunItem): Promise<RunSummary>;
  /** Reject a tool call with a note for the agent, so it can try again differently. */
  askForChanges(item: RunItem, note: string): Promise<RunSummary>;
  /** Any answer a `wait` step takes, by its event name, such as `escalate`. */
  answer(item: WaitItem, event: string): Promise<RunSummary>;
}

/** What an answer names: a tool call, or the wait step from the time it started waiting. */
function sendOptions(item: RunItem): SendOptions {
  return item.kind === "approval"
    ? { callId: item.callId }
    : { wait: { state: item.state, since: item.waitingAt } };
}

/**
 * Sends your answers through the executor. A tool call's answer names its
 * call, and a wait step's answer names its step, so an answer that comes
 * late can't answer the next call or the next wait step: the engine refuses
 * it and records nothing.
 *
 * @example
 * const decisions = inboxDecisions(executor);
 * await decisions.approve(items[0]);
 */
export function inboxDecisions(executor: Pick<RunExecutor, "send">): InboxDecisions {
  const send = (item: RunItem, event: string, payload?: unknown) =>
    executor.send(item.runId, event, payload, sendOptions(item));
  return {
    approve: (item) => send(item, "approve"),
    reject: (item) => send(item, "reject"),
    askForChanges: (item, note) => send(item, "reject", { comment: note }),
    answer: (item, event) => send(item, event),
  };
}

/**
 * What the run did with an answer, from the run as `send` returns it: it goes on (running, or
 * waiting again), it finished, or it ended another way (failed, or couldn't try). The decided line
 * says so, so it never says the run continues when the answer ended it (HAL-13919).
 */
export type AfterAnswer = "continues" | "finished" | "ended";

/** {@link AfterAnswer} for the run `send` returned. */
export function afterAnswer(run: Pick<RunSummary, "status">): AfterAnswer {
  if (run.status === "running" || run.status === "waiting") return "continues";
  return run.status === "completed" ? "finished" : "ended";
}

/** The engine's refusals that mean "not waiting for this answer any more", so trying again can't work. */
const staleAnswerCodes: ReadonlySet<string> = new Set([
  "engine.decision-callid-must-match",
  "engine.decision-wait-must-match",
  "engine.run-ended",
]);

/**
 * Whether an answer was refused because its tool call or wait step isn't the run's current one,
 * or the run has ended. The refusal's `code` is read, and its message too: it may reach Studio as
 * a plain `Error`. The served computer's refusal reaches Studio as a `conflict`.
 */
export function wasDecidedElsewhere(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (errorKindOf(error) === "conflict") return true;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return [code, message].some((each) => typeof each === "string" && staleAnswerCodes.has(each));
}
