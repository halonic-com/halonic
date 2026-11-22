// Where a run stands, and what a waiting run waits for, worked out from its
// summary alone. The Studio's status chip, the line under a run's name and
// its waiting banner all read these facts, and `halonic runs` prints the
// same ones (mc 15.2, cli-output 3.4, run-object-mapping sections 2 and 4).
// Only facts are decided here: each surface keeps its own words.

import type { OpenKeyOriginQuestion, PendingApproval, RunSummary } from "@halonicjs/events";

/**
 * Where a run stands, one value per status chip: `needs-you` when it waits
 * for the user, `waiting` when it waits for a time or a child run, `budget`
 * and `cancelled` for the two kinds of Stopped, and `cant-try` for a Try it
 * or Test run that ended at a step it couldn't try.
 */
export type RunStanding =
  | "running"
  | "needs-you"
  | "waiting"
  | "done"
  | "failed"
  | "budget"
  | "cancelled"
  | "cant-try";

/**
 * What a run waits for, in the order the first that applies wins: open
 * approvals, an open question "Allow this address?", a child run, a step
 * that takes events, a timer. `none` is a run that isn't waiting, or waits
 * with nothing to wait for.
 */
export type RunWait =
  | {
      kind: "approvals";
      /** The oldest open approval: Review in Inbox opens its card. */
      oldest: PendingApproval;
      count: number;
    }
  | {
      kind: "address";
      /** The oldest open question: the dialog that asks it is open. */
      oldest: OpenKeyOriginQuestion;
    }
  | { kind: "child-run"; runId: string }
  | {
      kind: "step";
      /** The wait step the run is in, or `null` before its first step. */
      state: string | null;
      /** The step's description as the engine filled it in; `null` when it has none. */
      title: string | null;
      events: string[];
      /** When the step's own timer is due, if it has one (ISO). */
      until: string | null;
    }
  | { kind: "timer"; at: string }
  | { kind: "none" };

/**
 * Where a run stands. Open approvals mean the run needs the user even while
 * its status is `running`: one parallel branch can wait for an OK while
 * another works (run-object-mapping section 2). So does an open question
 * "Allow this address?": the model call waits for the user's answer.
 *
 * @example
 * runStanding(summary); // "needs-you" for a run with an open approval
 */
export function runStanding(summary: RunSummary): RunStanding {
  switch (summary.status) {
    case "running":
      return waitsForTheUser(runWait(summary)) ? "needs-you" : "running";
    case "waiting":
      return waitsForTheUser(runWait(summary)) ? "needs-you" : "waiting";
    case "completed":
      return "done";
    case "failed":
      return failedStanding(summary);
    case "cant-try":
      return "cant-try";
  }
}

/**
 * What a run waits for. A running run waits only for its open approvals and
 * its open questions "Allow this address?"; an ended run waits for nothing.
 *
 * @example
 * runWait(summary); // { kind: "timer", at: "2026-11-09T14:00:00.000Z" }
 */
export function runWait(summary: RunSummary): RunWait {
  const oldest = summary.approvals[0];
  if (oldest !== undefined) {
    return { kind: "approvals", oldest, count: summary.approvals.length };
  }
  const asked = summary.keyOriginAsked?.[0];
  if (asked !== undefined && summary.status === "running") {
    return { kind: "address", oldest: asked };
  }
  if (summary.status !== "waiting") {
    return { kind: "none" };
  }
  if (summary.waitingOn !== null) {
    return { kind: "child-run", runId: summary.waitingOn };
  }
  if (summary.accepts.length > 0) {
    return {
      kind: "step",
      state: summary.state,
      title: summary.waitingFor?.title || null,
      events: summary.accepts,
      until: summary.nextTimer,
    };
  }
  if (summary.nextTimer !== null) {
    return { kind: "timer", at: summary.nextTimer };
  }
  return { kind: "none" };
}

/** Whether what the run waits for is the user's to answer: an approval, a question or a wait step. */
function waitsForTheUser(wait: RunWait): boolean {
  return wait.kind === "approvals" || wait.kind === "address" || wait.kind === "step";
}

/** A failed run is Stopped when it kept to its budget or was cancelled, else Failed. */
function failedStanding(summary: RunSummary): RunStanding {
  if (summary.reason === "budget") {
    return "budget";
  }
  if (summary.reason === "cancelled") {
    return "cancelled";
  }
  return "failed";
}
