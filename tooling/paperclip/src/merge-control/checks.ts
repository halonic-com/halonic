import type { CheckFact, GatePull } from "./snapshot.ts";

/**
 * The check rules of the gate (MERGER.md §4, rules 7–9): `ci-ok` on the
 * head, the required workflows after the last retarget, and `live-cloud`.
 */

/** `ci-ok` on a head: `success`, `pending`, `missing` or the run's conclusion. */
export interface CiOk {
  readonly state: string;
  readonly url?: string;
  readonly why?: string;
}

/** Workflows the ruleset requires besides CI (#4198, #4292). */
export const requiredWorkflows: readonly string[] = ["Guard notes", "Built-on label"];

function fromPull(check: CheckFact): boolean {
  return check.event !== "merge_group";
}

function byRun(a: CheckFact, b: CheckFact): number {
  return (
    a.runCreatedAt.localeCompare(b.runCreatedAt) ||
    (a.startedAt ?? "").localeCompare(b.startedAt ?? "")
  );
}

/**
 * The newest `ci-ok` on the head decides, ordered by run creation and then
 * start: GitHub goes by the newest run, not the newest attempt (#4340).
 * While any CI job on the head still runs it is pending: GitHub refuses with
 * "ci-ok is expected" then.
 */
export function ciOkOf(pull: GatePull): CiOk {
  const checks = pull.checks.filter(fromPull);
  const running = checks.find((check) => check.workflow === "CI" && check.status !== "completed");
  if (running !== undefined) {
    return { state: "pending", url: running.url, why: `CI still running: ${running.name}` };
  }
  const runs = checks.filter((check) => check.name === "ci-ok").sort(byRun);
  const last = runs.at(-1);
  if (last === undefined) {
    return { state: "missing" };
  }
  // A rerun not yet started has no start time, so any unfinished one makes it pending.
  const unfinished = runs.find(
    (check) => check.status !== "completed" || check.conclusion === null,
  );
  if (unfinished !== undefined) {
    return { state: "pending", url: unfinished.url };
  }
  return { state: last.conclusion ?? "pending", url: last.url };
}

/**
 * Each required workflow must have run and passed on the head after the last
 * retarget; only its newest run counts (#4331).
 */
export function requiredWorkflowProblems(pull: GatePull): string[] {
  const retarget = [...pull.retargetedAt].sort().pop() ?? "";
  const problems: string[] = [];
  for (const workflow of requiredWorkflows) {
    const runs = pull.checks
      .filter(
        (check) => fromPull(check) && check.workflow === workflow && check.runCreatedAt >= retarget,
      )
      .sort(byRun);
    const last = runs.at(-1);
    if (last === undefined) {
      problems.push(`${workflow} has not run`);
    } else if (runs.some((check) => check.status !== "completed")) {
      problems.push(`${workflow} pending`);
    } else if (!["success", "skipped", "neutral"].includes(last.conclusion ?? "")) {
      problems.push(`${workflow} ${last.conclusion ?? "pending"} (${last.name})`);
    }
  }
  return problems;
}

/** Whether `live-cloud` lets the pull request in, and why not (HAL-14858). */
export function liveCloudOf(pull: GatePull): { readonly ok: boolean; readonly why?: string } {
  const runs = pull.liveCloud;
  if (runs === null) {
    return { ok: false, why: "live-cloud: could not read checks" };
  }
  if (
    runs.length === 0 ||
    runs.some((run) => run.status === "completed" && run.conclusion === "success")
  ) {
    return { ok: true };
  }
  const newest = [...runs].sort((a, b) =>
    (b.startedAt ?? b.runCreatedAt).localeCompare(a.startedAt ?? a.runCreatedAt),
  )[0];
  if (newest === undefined || (newest.status === "completed" && newest.conclusion === "skipped")) {
    return { ok: true };
  }
  const state = newest.status === "completed" ? (newest.conclusion ?? "unknown") : newest.status;
  return { ok: false, why: `live-cloud ${state} (${newest.url})` };
}
