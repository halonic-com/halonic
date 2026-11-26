import {
  type LineDeps,
  monitorWakeReason,
  type PacketRequest,
  taskLines,
  timeout,
} from "../state-packet/build.ts";
import { type NewestComment, type Verdict, wakeVerdict } from "./verdict.ts";

/**
 * The wake gate in measure-only mode (HAL-18985). On each monitor wake the
 * server asks the state packet for, it works out whether the run had
 * something to do and only reports it: the wake always starts. 48 hours of
 * these reports, set against what the runs then did, decide whether the
 * gate is switched on.
 */

/** The `wakeGate` setting: `off` (the default) or `measure`. */
export type GateMode = "off" | "measure";

/** The task as the gate needs it. */
export interface GateTask {
  readonly identifier: string;
  readonly assigneeAgentId: string | null;
}

/** What the gate reads on top of the pull request lines, so tests can fake it. */
export interface GateDeps extends LineDeps {
  readonly mode: (companyId: string) => Promise<GateMode>;
  readonly task: (issueId: string, companyId: string) => Promise<GateTask | undefined>;
  /** The agent id that wrote the task's newest comment: null for a person, undefined with no comments. */
  readonly newestCommentBy: (
    issueId: string,
    companyId: string,
  ) => Promise<string | null | undefined>;
}

/** What the gate reports for a wake it looked at; `verdict` is undefined when it couldn't decide, with the reason. */
export type GateReport =
  | { readonly task: string; readonly verdict: Verdict }
  | { readonly task: string | undefined; readonly verdict: undefined; readonly reason: string };

/** The gate gives up after this long; it only reports, so nothing waits on it. */
export const gateTimeoutMs = 8_000;

function newestOf(by: string | null | undefined, holder: string | null): NewestComment {
  if (by === undefined) {
    return { by: "none" };
  }
  return by !== null && by === holder ? { by: "holder" } : { by: "other" };
}

/** Whether the gate looks at this wake: a monitor wake with the setting on `measure`. */
async function inPlay(request: PacketRequest, deps: GateDeps): Promise<boolean> {
  return (
    request.wakeReason === monitorWakeReason && (await deps.mode(request.companyId)) === "measure"
  );
}

async function decide(request: PacketRequest, deps: GateDeps): Promise<GateReport> {
  const { companyId, issueId } = request;
  const task = await deps.task(issueId, companyId);
  if (task === undefined) {
    return { task: undefined, verdict: undefined, reason: "task not found" };
  }
  const read = await taskLines(companyId, task.identifier, deps);
  if (read.lines === null) {
    return { task: task.identifier, verdict: undefined, reason: read.reason };
  }
  const by = await deps.newestCommentBy(issueId, companyId);
  return {
    task: task.identifier,
    verdict: wakeVerdict(read.lines, newestOf(by, task.assigneeAgentId)),
  };
}

/** The gate's report for one wake, or undefined when it doesn't look at it. It never throws. */
export async function gateReport(
  request: PacketRequest,
  deps: GateDeps,
  timeoutMs = gateTimeoutMs,
): Promise<GateReport | undefined> {
  try {
    if (!(await inPlay(request, deps))) {
      return undefined;
    }
    return await Promise.race([decide(request, deps), timeout(timeoutMs)]);
  } catch (error) {
    return {
      task: undefined,
      verdict: undefined,
      reason: `couldn't decide: ${(error as Error).message}`,
    };
  }
}
