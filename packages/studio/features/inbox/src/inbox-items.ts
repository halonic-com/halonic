import type { RunSummary } from "@halonicjs/events";

/** A tool call that waits for your OK, one per call (`RunSummary.approvals`). */
export interface ApprovalItem {
  readonly kind: "approval";
  /** Unique in the Inbox: the run and the call. */
  readonly key: string;
  readonly runId: string;
  /** The engine's own id of the call; the answer names it, so it can't answer a later call. */
  readonly callId: string;
  /** The step's agent, by its id: the one that asked, or the one whose subagent asked. */
  readonly agent: string;
  /** The subagent that asked for `agent`, by its id, or `null` when `agent` asked itself. */
  readonly subagent: string | null;
  /** The agent's name as its file says; its id when the file can't be read. */
  readonly agentName: string;
  /** The subagent's name, likewise; `null` when `agent` asked itself. */
  readonly subagentName: string | null;
  /** The tool's name, such as `create_note`. */
  readonly tool: string;
  /** The connector the tool comes from, such as `notes-mcp`, or `null` for a built-in tool. */
  readonly connector: string | null;
  /** The tool name as the engine logged it, without the connector. */
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
   * The step's own label for an answer, by its event, such as `escalate: "Ask a lead"`, as core
   * gives them (HAL-4014). An answer without one has the built-in label.
   */
  readonly answerLabels: Readonly<Record<string, string>>;
  /** ISO time the run started waiting. */
  readonly since: string;
  /**
   * ISO time of the run's last `run.waiting`, which with `state` names this wait step. An answer
   * carries it, so a card that has moved on can't answer the next step.
   */
  readonly waitingAt: string;
  /** ISO time the step's first timer moves the run on by itself, or `null` without a timer. */
  readonly movesOnAt: string | null;
}

/** An item a run waits on: it holds the run and the answer goes to the run. */
export type RunItem = ApprovalItem | WaitItem;

/**
 * An account to set up or fix, such as a Google account to sign in again (setup flow 1). Not tied
 * to a run: a setup source gives it, one per account, and it takes no Approve or Reject.
 */
export interface SetupItem {
  readonly kind: "setup";
  /** `setup:<provider>:<account>`. Never holds an e-mail address. */
  readonly key: string;
  /** The source's provider, such as `google`. */
  readonly provider: string;
  /** The source's own ref for the account; never an e-mail address. */
  readonly account: string;
  /** The row title and the item's title: "Set up Google for x@example.com". */
  readonly title: string;
  /** The line under the title: "Step 4 of 7 · Scopes". */
  readonly progress: string;
  /** ISO time the setup last changed; the most recent comes first. */
  readonly changedAt: string;
  /** Whether the account still needs a secret from you, so a secret pasted elsewhere goes here first. */
  readonly needsSecret?: boolean;
  /** The setup is done and the item only stays to say so: it isn't counted and shows "Fixed". */
  readonly fixed?: boolean;
}

export type InboxItem = SetupItem | RunItem;

/** Whether a run waits on the item, so it takes an answer; a setup item doesn't. */
export function isRunItem(item: InboxItem): item is RunItem {
  return item.kind !== "setup";
}

/**
 * What waits for you in these runs, newest first: one item for each tool
 * call waiting for your OK, and one for each run at a `wait` step. A run
 * that waits on its child run has no item of its own; the child's item is
 * the one to answer. A `wait` step that only has timers takes no answer, so
 * it has none either. Test runs (Try it) never ask, so they have none.
 *
 * @param nameOfAgent an agent's name as its file says; its id when the file can't be read
 *
 * @example
 * inboxItems(await store.list({ status: ["waiting"] }), (id) => agentNames.get(id) ?? id);
 */
export function inboxItems(
  runs: readonly RunSummary[],
  nameOfAgent: (agentId: string) => string = (id) => id,
): RunItem[] {
  const items: RunItem[] = [];
  for (const run of runs) {
    if (run.status !== "waiting" || run.kind === "test") continue;
    if (run.approvals.length > 0) {
      for (const approval of run.approvals) items.push(approvalItem(run.id, approval, nameOfAgent));
    } else if (
      run.waitingOn === null &&
      run.state !== null &&
      run.accepts.length > 0 &&
      run.lastWaitingAt !== null
    ) {
      items.push(waitItem(run, run.state, run.lastWaitingAt));
    }
  }
  return items.sort(newestFirst);
}

function approvalItem(
  runId: string,
  approval: RunSummary["approvals"][number],
  nameOfAgent: (agentId: string) => string,
): ApprovalItem {
  return {
    kind: "approval",
    key: `${runId}:${approval.callId}`,
    runId,
    callId: approval.callId,
    agent: approval.agent,
    subagent: approval.subagent ?? null,
    agentName: nameOfAgent(approval.agent),
    subagentName: approval.subagent === undefined ? null : nameOfAgent(approval.subagent),
    tool: approval.tool,
    connector: approval.connector ?? null,
    rawTool: approval.tool,
    args: approval.args,
    since: approval.at,
    state: approval.state,
    branch: approval.branch,
    item: approval.item,
  };
}

function waitItem(run: RunSummary, state: string, waitingAt: string): WaitItem {
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
    answerLabels: run.answerLabels,
    since: waitingAt,
    waitingAt,
    movesOnAt: run.nextTimer,
  };
}

/**
 * The key of an account's setup item. The account is the source's own ref, so no e-mail address
 * ends up in a key, a URL or a log.
 *
 * @example
 * setupKey("google", "acct-7f3a"); // "setup:google:acct-7f3a"
 */
export function setupKey(provider: string, account: string): string {
  return `setup:${provider}:${account}`;
}

/**
 * Needs you's order: setup items first, the most recently changed first, then the run items as
 * they come (setup flow 1, UX checklist section 8 point 1).
 */
export function needsYouOrder(setups: readonly SetupItem[], runs: readonly RunItem[]): InboxItem[] {
  const recentFirst = [...setups].sort((a, b) => byTimeThenKey(a.changedAt, b.changedAt, a, b));
  return [...recentFirst, ...runs];
}

function newestFirst(a: RunItem, b: RunItem): number {
  return byTimeThenKey(a.since, b.since, a, b);
}

/** Later times first; on the same time, by key. */
function byTimeThenKey(aTime: string, bTime: string, a: InboxItem, b: InboxItem): number {
  if (aTime !== bTime) return aTime < bTime ? 1 : -1;
  // A plain comparison, so the order doesn't depend on the locale.
  if (a.key === b.key) return 0;
  return a.key < b.key ? -1 : 1;
}
