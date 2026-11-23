import type { WorkerAgentsPage, WorkerRow } from "../page.ts";
import { type CheckStatus, checkCounts, type RuleName } from "../rule-checks.ts";
import { leftOutText, utcTime } from "./view.ts";

/**
 * The rule checks' words on the Worker agents page (HAL-16250), apart from
 * React so tests can check them. Wording follows Sofia's states document
 * (HAL-16208, sections 2 and 4): no colour words, "problem" and "to check",
 * times in UTC, and never "OK" when a check couldn't run.
 */

/** The column headers, in `ruleNames` order. */
export const ruleHeaders: Readonly<Record<RuleName, string>> = {
  newWorkOnRedPr: "New work on a red PR",
  taskState: "Task state",
  monitors: "Monitors",
  workload: "Workload",
  branchNames: "Branch names",
};

/** The words a check's result reads as. */
export const checkWords: Readonly<Record<CheckStatus, string>> = {
  ok: "OK",
  check: "Check",
  problem: "Problem",
  unavailable: "Not available yet",
  not_checked: "Not checked",
};

/** The SDK badge for a result that has one; the two that can't run are plain text instead. */
export const badgeStatus = { ok: "ok", check: "warning", problem: "error" } as const;

/** The board check runs every 10 minutes, and so does the PR watcher's snapshot. */
const intervalMs = 10 * 60_000;
/** Out of date after two intervals plus 2 minutes: at least one pass missed, without flicker. */
const outOfDateMs = 2 * intervalMs + 2 * 60_000;

/** Whether the row needs attention: a Problem or a Check. */
export function needsAttention(row: WorkerRow): boolean {
  const counts = checkCounts(row.checks);
  return counts.problems + counts.toCheck > 0;
}

/** The row's status under the agent's name: "1 problem · 1 to check", or "All OK". */
export function rowStatusText(row: WorkerRow): string | undefined {
  if (row.checks === undefined) {
    return undefined;
  }
  const { problems, toCheck } = checkCounts(row.checks);
  const parts = [
    ...(problems > 0 ? [`${problems} ${problems === 1 ? "problem" : "problems"}`] : []),
    ...(toCheck > 0 ? [`${toCheck} to check`] : []),
  ];
  return parts.length === 0 ? "All OK" : parts.join(" · ");
}

/** "18 agents · 2 with a problem · 3 to check · 13 all OK · Pip left out". */
export function checksSummary(page: WorkerAgentsPage): string {
  const counts = page.agents.map((row) => checkCounts(row.checks));
  const problem = counts.filter((count) => count.problems > 0).length;
  const toCheck = counts.filter((count) => count.problems === 0 && count.toCheck > 0).length;
  const allOk = page.agents.length - problem - toCheck;
  return `${page.agents.length} agents · ${problem} with a problem · ${toCheck} to check · ${allOk} all OK${leftOutText(page)}`;
}

function minutesAgo(iso: string, now: string): number {
  return Math.round((Date.parse(now) - Date.parse(iso)) / 60_000);
}

function missedPasses(iso: string, now: string): number {
  return Math.max(1, Math.floor((Date.parse(now) - Date.parse(iso) - 2 * 60_000) / intervalMs));
}

const passes = (count: number) => (count === 1 ? "1 pass" : `${count} passes`);

/** Whether a snapshot taken at `iso` is out of date at `now`. */
export function outOfDate(iso: string, now: string): boolean {
  return Date.parse(now) - Date.parse(iso) > outOfDateMs;
}

/** The banner over the table when the board check's rows are out of date, or undefined. */
export function checksBanner(page: WorkerAgentsPage): string | undefined {
  const at = page.checkedAt;
  if (at === null || !outOfDate(at, page.at)) {
    return undefined;
  }
  return `These checks are from ${utcTime(at)}, ${minutesAgo(at, page.at)} min ago. board.check has missed ${passes(missedPasses(at, page.at))}, so the rows below may be out of date.`;
}

/** The banner for the PR watcher's data: none yet, or out of date; undefined while it's fresh. */
export function prDataBanner(page: WorkerAgentsPage): string | undefined {
  const at = page.prDataAt;
  if (page.checkedAt === null) {
    return undefined;
  }
  if (at === null) {
    return "Open PRs and branch names appear once pr.watch writes its first snapshot.";
  }
  if (!outOfDate(at, page.at)) {
    return undefined;
  }
  return `Open PRs and branch names are from ${utcTime(at)}, ${minutesAgo(at, page.at)} min ago. pr.watch has missed ${passes(missedPasses(at, page.at))}.`;
}

/** The line for agents whose checks are all OK, under the ones that need attention, or alone. */
export function allOkText(page: WorkerAgentsPage, okRows: readonly WorkerRow[]): string {
  const at = page.checkedAt ?? page.at;
  const stale = outOfDate(at, page.at);
  if (okRows.length === page.agents.length) {
    const count = `All ${okRows.length} worker agents`;
    if (page.prDataAt === null) {
      return `${count} pass the 3 checks that can run now. Open PRs, branch names and "New work on a red PR" aren't available yet.`;
    }
    return stale
      ? `${count} passed every check at ${utcTime(at)}.`
      : `${count} pass every check. Checked ${utcTime(at)}.`;
  }
  const active = okRows.filter((row) => !row.paused).map((row) => row.name);
  const paused = okRows.filter((row) => row.paused).map((row) => row.name);
  const pausedText =
    paused.length === 0 ? "" : ` and ${paused.length} paused: ${paused.join(", ")}`;
  return `${okRows.length} more agents, all checks OK: ${active.join(", ")}${pausedText}`;
}

/** The toggle's words: "Show the 13 all-OK agents", "Hide …", or "Show the 18 agents" when all are OK. */
export function toggleText(okCount: number, allOk: boolean, shown: boolean): string {
  const what = allOk ? `the ${okCount} agents` : `the ${okCount} all-OK agents`;
  return `${shown ? "Hide" : "Show"} ${what}`;
}
