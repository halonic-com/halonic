import { logLine, type PassContext } from "./context.ts";
import type { GateRow } from "./gate.ts";
import type { GatePull, GroupRun, MergeSnapshot } from "./snapshot.ts";
import { texts } from "./texts.ts";

/**
 * Main is broken, not the group's pull request (Chief, HAL-17875, 24 Nov
 * 22:20, as the Merger's `pass.js` does it): when every failed job's
 * annotations name files, and none of them is a file the pull request
 * touches, the main-red freeze starts (only reverts, and the fix the board
 * adds to its pattern, go in) and is said once. The pull request is still
 * held on that head (HAL-18340): #5969 went back in on the same head after
 * main was blamed, failed again and took #5994's group with it. A job
 * whose annotations name no file (typecheck, tests) keeps the culprit hold.
 *
 * A group stacked on other groups carries their pull requests too (HAL-18287,
 * #5969/#5994): the files of every pull request ahead of it in the chain
 * count as its own, and one of them touching a named file is the culprit.
 *
 * Any group, stacked or directly on main's tip, freezes only while main's
 * newest finished push run is red (HAL-18306): an annotation can name a file
 * that imports the one a pull request changed, so no file matches it.
 * Otherwise main broken is only suspected, said once, and the group's own
 * pull request is held as before.
 */

/** The freeze's pattern until the board adds the fix pull request. */
export const mainBrokenAllowRe = "^revert\\b";

/** The files every failed job names, or undefined when a job names none or wasn't read. */
export function brokenFiles(run: GroupRun): string[] | undefined {
  if (run.failedJobs.length === 0) {
    return undefined;
  }
  const files = new Set<string>();
  for (const job of run.failedJobs) {
    if (job.annotatedFiles === undefined || job.annotatedFiles.length === 0) {
      return undefined;
    }
    for (const file of job.annotatedFiles) {
      files.add(file);
    }
  }
  return [...files];
}

/** The pull request and base commit a `gh-readonly-queue/main/pr-<number>-<sha>` branch names. */
function groupBranch(branch: string): { number: number; base: string } | undefined {
  const match = /pr-(\d+)-([0-9a-f]+)$/.exec(branch);
  return match?.[1] === undefined || match[2] === undefined
    ? undefined
    : { number: Number(match[1]), base: match[2] };
}

/**
 * The pull requests ahead of a merge group, nearest first: each group's base
 * is the head of the group before it, back to a commit that is no group's
 * head (main's tip).
 */
export function pullsAhead(snapshot: MergeSnapshot, branch: string): number[] {
  const groups = new Map<string, { number: number; base?: string }>();
  for (const entry of snapshot.queue) {
    if (entry.groupHead !== null) {
      groups.set(entry.groupHead, { number: entry.number });
    }
  }
  for (const run of snapshot.mergeGroupRuns) {
    const named = groupBranch(run.branch);
    if (named !== undefined) {
      groups.set(run.headSha, named);
    }
  }
  const ahead: number[] = [];
  const seen = new Set<string>();
  let base = groupBranch(branch)?.base;
  while (base !== undefined && !seen.has(base)) {
    seen.add(base);
    const group = groups.get(base);
    if (group === undefined) {
      break;
    }
    ahead.push(group.number);
    base = group.base;
  }
  return ahead;
}

/** Whether every changed file is known: past the first 100 the pull request may touch one. */
function allFilesRead(pull: GatePull): boolean {
  return pull.filesTotal <= pull.files.length;
}

/** The newest completed, not cancelled `CI` push run on main, or undefined. */
function newestMainPush(snapshot: MergeSnapshot) {
  return snapshot.mainRuns
    .filter((run) => run.status === "completed" && run.conclusion !== "cancelled")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/**
 * Who failed `row`'s group: the row to hold (its own, or one ahead of it in
 * the group chain), or undefined when main is broken and the freeze is on
 * (the caller still holds `row`'s head).
 */
export function groupCulprit(
  context: PassContext,
  run: GroupRun,
  row: GateRow,
  rows: readonly GateRow[],
  where: string,
): GateRow | undefined {
  const { pull } = row;
  const files = brokenFiles(run);
  const touches = (each: GatePull) => files?.some((file) => each.files.includes(file)) ?? false;
  if (files === undefined || !allFilesRead(pull) || touches(pull)) {
    return row;
  }
  const ahead = pullsAhead(context.snapshot, run.branch).map((number) =>
    rows.find((each) => each.pull.number === number),
  );
  if (ahead.some((each) => each === undefined || !allFilesRead(each.pull))) {
    return row;
  }
  const culprit = ahead.find((each) => each !== undefined && touches(each.pull));
  if (culprit !== undefined) {
    logLine(
      context,
      "culprit",
      `failed group ${where} culprit #${culprit.pull.number}(ahead of #${pull.number} in the group chain)`,
    );
    return culprit;
  }
  const { state } = context;
  const push = newestMainPush(context.snapshot);
  // Not read counts as green: a freeze stalls the whole queue, a hold only this pull request.
  if (push === undefined || push.conclusion === "success") {
    const sha = push?.headSha.slice(0, 9) ?? "not read";
    if (state.noted["main-broken-suspected"] !== sha) {
      state.noted["main-broken-suspected"] = sha;
      logLine(
        context,
        "main-broken",
        `main-broken suspected, not frozen (main push ${sha}${push === undefined ? "" : " green"})`,
      );
    }
    return row;
  }
  const named = files.slice(0, 3).join(", ");
  logLine(
    context,
    "culprit",
    `failed group ${where} culprit #${pull.number}(not this PR: main broken in ${named})`,
  );
  const at = context.now.toISOString();
  if (state.mainBroken === null) {
    state.mainBroken = { since: at, run: run.url, files };
    logLine(context, "main-broken", texts.mainBroken(named, run.url));
  }
  state.board.mainRed ??= { since: at, allowRe: mainBrokenAllowRe };
  return undefined;
}
