import type { RunSummary } from "@halonicjs/events";

/** A tool call that waits for your OK, one per call (`RunSummary.approvals`). */
export interface ApprovalItem {
  readonly kind: "approval";
  /** Unique in the Inbox: the run and the call. */
  readonly key: string;
  readonly runId: string;
  /** The engine's own id of the call; the answer names it, so it can't answer a later call. */
  readonly callId: string;
  /** The agent that asked, by its id. */
  readonly agent: string;
  /** The tool's name, such as `create_note`. */
  readonly tool: string;
  /** The connector the tool comes from, such as `notes-mcp`, or `null` for a built-in tool. */
  readonly connector: string | null;
  /** The name the agent called, such as `notes-mcp__create_note`. */
  readonly rawTool: string;
  /** The arguments the agent sent, as it sent them. */
  readonly args: unknown;
  /** ISO time the approval was asked for. */
  readonly since: string;
  readonly state: string;
  readonly branch: string | null;
  readonly item: number | null;
}

/** A `wait` step that waits for you, such as Acme's "Approve this reply?". */
export interface WaitItem {
  readonly kind: "wait";
  readonly key: string;
  readonly runId: string;
  readonly state: string;
  /**
   * The step's first line, filled in by core, else its id with a capital
   * first letter. The row title and the card title.
   */
  readonly title: string;
  /** Lines 2 onward, filled in by core. Holds model output: show it as plain text. */
  readonly body: string;
  /** The answers the step takes, such as `approve` and `reject`. */
  readonly accepts: readonly string[];
  /**
   * The step's own label for an answer, by its event, such as `escalate: "Ask a lead"`. Core
   * doesn't send them yet (HAL-4014), so this is empty and the built-in labels apply.
   */
  readonly answerLabels: Readonly<Record<string, string>>;
  /** ISO time the run started waiting. */
  readonly since: string;
  /** ISO time the step's first timer moves the run on by itself, or `null` without a timer. */
  readonly movesOnAt: string | null;
}

export type InboxItem = ApprovalItem | WaitItem;

/** The separator between a connector's name and its tool's name in the name an agent calls. */
const connectorSeparator = "__";

/**
 * What waits for you in these runs, newest first: one item for each tool
 * call waiting for your OK, and one for each run at a `wait` step. A run
 * that waits on its child run has no item of its own; the child's item is
 * the one to answer. A `wait` step that only has timers takes no answer, so
 * it has none either. Test runs (Try it) never ask, so they have none.
 *
 * @example
 * inboxItems(await store.list({ status: ["waiting"] }));
 */
export function inboxItems(runs: readonly RunSummary[]): InboxItem[] {
  const items: InboxItem[] = [];
  for (const run of runs) {
    if (run.status !== "waiting" || run.kind === "test") continue;
    if (run.approvals.length > 0) {
      for (const approval of run.approvals) items.push(approvalItem(run.id, approval));
    } else if (run.waitingOn === null && run.state !== null && run.accepts.length > 0) {
      items.push(waitItem(run, run.state));
    }
  }
  return items.sort(newestFirst);
}

function approvalItem(runId: string, approval: RunSummary["approvals"][number]): ApprovalItem {
  // A name that starts with the separator has no connector before it.
  const separator = approval.tool.indexOf(connectorSeparator);
  const hasConnector = separator > 0;
  return {
    kind: "approval",
    key: `${runId}:${approval.callId}`,
    runId,
    callId: approval.callId,
    agent: approval.agent,
    tool: hasConnector ? approval.tool.slice(separator + connectorSeparator.length) : approval.tool,
    connector: hasConnector ? approval.tool.slice(0, separator) : null,
    rawTool: approval.tool,
    args: approval.args,
    since: approval.at,
    state: approval.state,
    branch: approval.branch,
    item: approval.item,
  };
}

function waitItem(run: RunSummary, state: string): WaitItem {
  const title = run.waitingFor?.title ?? "";
  return {
    kind: "wait",
    key: `${run.id}:${state}`,
    runId: run.id,
    state,
    // The same fallback as the CLI's step names (cli-output 3.4).
    title: title === "" ? state.charAt(0).toUpperCase() + state.slice(1) : title,
    body: run.waitingFor?.body ?? "",
    accepts: run.accepts,
    answerLabels: {},
    since: run.lastWaitingAt ?? run.updatedAt,
    movesOnAt: run.nextTimer,
  };
}

function newestFirst(a: InboxItem, b: InboxItem): number {
  if (a.since !== b.since) return a.since < b.since ? 1 : -1;
  // A plain comparison, so the order doesn't depend on the locale.
  if (a.key === b.key) return 0;
  return a.key < b.key ? -1 : 1;
}
