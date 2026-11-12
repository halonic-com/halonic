import type { RunSummary } from "@halonicjs/events";
import type { RunExecutor } from "@halonicjs/ports";
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

/**
 * Sends your answers through the executor. A tool call's answer names its
 * call, so an answer that comes late can't answer the next call: the engine
 * refuses it and records nothing.
 *
 * @example
 * const decisions = inboxDecisions(executor);
 * await decisions.approve(items[0]);
 */
export function inboxDecisions(executor: Pick<RunExecutor, "send">): InboxDecisions {
  const send = (item: RunItem, event: string, payload?: unknown) =>
    executor.send(
      item.runId,
      event,
      payload,
      item.kind === "approval" ? { callId: item.callId } : undefined,
    );
  return {
    approve: (item) => send(item, "approve"),
    reject: (item) => send(item, "reject"),
    askForChanges: (item, note) => send(item, "reject", { comment: note }),
    answer: (item, event) => send(item, event),
  };
}
