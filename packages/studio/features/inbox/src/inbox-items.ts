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
 * the one to answer. Test runs (Try it) never ask, so they have none.
 *
 * @example
 * inboxItems(await runs.list({ status: ["waiting"] }));
 */
export function inboxItems(runs: readonly RunSummary[]): InboxItem[] {
  const items: InboxItem[] = [];
  for (const run of runs) {
    if (run.status !== "waiting" || run.kind === "test") continue;
    if (run.approvals.length > 0) {
      for (const approval of run.approvals) items.push(approvalItem(run.id, approval));
    } else if (run.waitingOn === null && run.state !== null) {
      items.push(waitItem(run, run.state));
    }
  }
  return items.sort(newestFirst);
}

function approvalItem(runId: string, approval: RunSummary["approvals"][number]): ApprovalItem {
  const separator = approval.tool.indexOf(connectorSeparator);
  return {
    kind: "approval",
    key: `${runId}:${approval.callId}`,
    runId,
    callId: approval.callId,
    agent: approval.agent,
    tool:
      separator === -1 ? approval.tool : approval.tool.slice(separator + connectorSeparator.length),
    connector: separator === -1 ? null : approval.tool.slice(0, separator),
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
    since: run.lastWaitingAt ?? run.updatedAt,
    movesOnAt: run.nextTimer,
  };
}

function newestFirst(a: InboxItem, b: InboxItem): number {
  if (a.since !== b.since) return a.since < b.since ? 1 : -1;
  return a.key.localeCompare(b.key);
}
