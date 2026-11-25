import { fastTrackLabel } from "../pr-tools/queue-state.ts";
import { queuePrio } from "../rules/queue-prio.ts";
import { capacityShort, jumpCost, noCost } from "./capacity.ts";
import { liveCloudOf } from "./checks.ts";
import { commentOnce, logLine, type PassContext } from "./context.ts";
import { fastTrackVerified, type GateRow } from "./gate.ts";
import { texts } from "./texts.ts";

/**
 * Filling the queue (MERGER.md §4 "Fill order" and "Fast-track PRs"):
 * critical path first by `queue.prio`, fast-track first of all, up to the
 * target, past the holds; and when a fast-track pull request jumps.
 */

/** Hotspots: two queued pull requests never share one (board, 20 Nov). */
export function isHotspot(path: string): boolean {
  return (
    path === "pnpm-lock.yaml" ||
    path === "package.json" ||
    path === "turbo.json" ||
    path.startsWith(".github/workflows/")
  );
}

/** Labelled `fast-track` by a verified labeller (rule 3); others are logged and queued normally. */
export function verifiedFastTrack(context: PassContext, rows: readonly GateRow[]): Set<number> {
  const fast = new Set<number>();
  const unverified: string[] = [];
  for (const row of rows.filter((each) => each.pull.labels.includes(fastTrackLabel))) {
    if (fastTrackVerified(row.pull, context.settings)) {
      fast.add(row.pull.number);
    } else {
      unverified.push(`#${row.pull.number}(${row.pull.fastTrackBy ?? "?"})`);
    }
  }
  if (unverified.length > 0) {
    logLine(context, "fast-track", `FAST_UNVERIFIED ${unverified.join(" ")}`);
  }
  return fast;
}

/** Marks when each pull request first passed the gate out of the queue, for aging. */
export function trackReady(context: PassContext, rows: readonly GateRow[]): void {
  const ready = context.state.readySince;
  for (const row of rows) {
    const key = String(row.pull.number);
    if (row.entry === undefined && row.pass) {
      ready[key] ??= context.now.toISOString();
    } else {
      delete ready[key];
    }
  }
}

/**
 * Predicted to conflict in the queue (report item 11): it changes a file a
 * queued pull request changes too. Without git in the plugin this is the
 * file overlap; it only ranks, it never keeps a pull request out.
 */
export function predictsConflict(row: GateRow, queued: readonly GateRow[]): boolean {
  return queued.some((each) => each.pull.files.some((path) => row.pull.files.includes(path)));
}

/**
 * Candidates, fast-track first whatever the board's boost, then highest
 * score (board boost plus `queue.prio`), then the ones predicted not to
 * conflict with the queue; ties go to the oldest.
 */
export function fillOrder(
  context: PassContext,
  rows: readonly GateRow[],
  fast: ReadonlySet<number>,
  queued: readonly GateRow[],
): GateRow[] {
  const { snapshot, state, now } = context;
  const candidates = rows.filter(
    (row) => row.entry === undefined && row.pass && row.candidate && !row.pull.draft,
  );
  const ranked = queuePrio({
    ranked: candidates.map((row) => ({
      number: row.pull.number,
      branch: row.pull.branch,
      base: row.pull.base,
      readySince: state.readySince[String(row.pull.number)],
    })),
    open: (snapshot.open ?? []).map((pull) => ({ ...pull, readySince: undefined })),
    tasks: snapshot.tasks,
    now,
  });
  const tier = (row: GateRow) => (fast.has(row.pull.number) ? 1 : 0);
  const score = (row: GateRow) =>
    (state.board.prio[String(row.pull.number)] ?? 0) +
    (ranked.find((each) => each.number === row.pull.number)?.score ?? 0);
  const clash = new Set(
    candidates.filter((row) => predictsConflict(row, queued)).map((row) => row.pull.number),
  );
  if (clash.size > 0) {
    logLine(context, "fill", `CONFLICT_PREDICTED ${[...clash].map((n) => `#${n}`).join(" ")}`);
  }
  const risk = (row: GateRow) => (clash.has(row.pull.number) ? 1 : 0);
  return candidates.sort(
    (a, b) =>
      tier(b) - tier(a) ||
      score(b) - score(a) ||
      risk(a) - risk(b) ||
      a.pull.createdAt.localeCompare(b.pull.createdAt),
  );
}

/** What holds a candidate back this pass, or undefined when it may go in. */
function waitReason(
  context: PassContext,
  row: GateRow,
  still: readonly GateRow[],
  held: ReadonlySet<string>,
) {
  const { state } = context;
  const key = String(row.pull.number);
  if (state.board.hold[key] !== undefined) {
    return "board hold";
  }
  if (state.failedHeads[key] === row.pull.head) {
    return "failed in a merge group on this head; waits for a new head";
  }
  const cooldown = state.cooldown[key];
  if (cooldown !== undefined) {
    const ahead = cooldown.ahead.filter((number) =>
      still.some((each) => each.pull.number === number),
    );
    if (cooldown.head === row.pull.head && ahead.length > 0) {
      return `removed as unmergeable at ${cooldown.at.slice(11, 16)}; waits for a new head or for ${ahead.map((number) => `#${number}`).join(",")} to leave the queue`;
    }
    delete state.cooldown[key];
  }
  if (row.pull.filesTotal > row.pull.files.length) {
    return `touches ${row.pull.filesTotal} files (over 100), queue by hand`;
  }
  const clash = row.pull.files.filter((path) => isHotspot(path) && held.has(path));
  if (clash.length > 0) {
    return `shares ${clash.slice(0, 3).join(", ")}${clash.length > 3 ? " …" : ""} with a queued PR (hotspot)`;
  }
  const live = liveCloudOf(row.pull);
  if (!live.ok) {
    commentOnce(context, "live-cloud", row.pull.number, row.pull.head, texts.liveCloud);
    return live.why;
  }
  return undefined;
}

/** The switches that limit who goes in this pass. */
export interface FillLimits {
  readonly pauseOn: boolean;
  readonly waitFor: readonly number[];
  readonly freeze: RegExp | null;
}

function matches(pattern: RegExp, row: GateRow): boolean {
  return pattern.test(`${row.pull.title} ${row.pull.branch}`);
}

/** Left out in silence by the fill pause or the main-red freeze. */
function excluded(row: GateRow, limits: FillLimits): boolean {
  return (
    (limits.pauseOn && !limits.waitFor.includes(row.pull.number)) ||
    (limits.freeze !== null && !matches(limits.freeze, row))
  );
}

/** Sends the enqueue and its carry-over note, and logs it. */
function enqueue(
  context: PassContext,
  row: GateRow,
  jump: boolean,
  isFast: boolean,
  queued: readonly number[],
): void {
  const { number, head } = row.pull;
  const cost = jump ? jumpCost(context, queued) : noCost;
  context.actions.push({ kind: "enqueue", number, pullId: row.pull.id, head, jump, cost });
  if (jump) {
    logLine(
      context,
      "fill",
      `JUMPED #${number}${isFast ? " (fast-track)" : " (fix)"} cancels=${cost.groupsCancelled} runnerMinutes=${cost.runnerMinutes}`,
    );
  }
  const carried = row.approval?.carried;
  if (carried !== undefined) {
    commentOnce(context, "carried", number, head, texts.carried(carried, head));
    logLine(context, "fill", `added #${number}(approval=carried (rebase, identical diff))`);
  } else {
    logLine(
      context,
      "fill",
      `added #${number}${row.approval?.julian === true ? "(approval=julian)" : ""}`,
    );
  }
}

/**
 * A wanted jump goes only while runner capacity isn't short, except the fix
 * under a main-red freeze, which jumps anyway (Liam, HAL-17762); a held one
 * is logged.
 */
function jumps(
  context: PassContext,
  row: GateRow,
  wantsJump: boolean,
  isFix: boolean,
  short: string | undefined,
): boolean {
  if (wantsJump && short !== undefined) {
    if (isFix) {
      logLine(context, "fill", `JUMP_SHORT #${row.pull.number} (main red; ${short})`);
      return true;
    }
    logLine(context, "fill", `NO_JUMP #${row.pull.number} (${short})`);
    return false;
  }
  return wantsJump;
}

/**
 * Enqueues candidates in order up to the target. A fast-track pull request
 * isn't held back by the target, so every ready one goes in during the same
 * pass. It jumps only with more than `jumpAhead` entries queued and no
 * fast-track pull request in the queue (HAL-17697); a queued one is never
 * taken out to jump again. A fix under a main-red freeze jumps too, even
 * while runner capacity is short or unknown; no other pull request does (ADR).
 */
export function fill(
  context: PassContext,
  ordered: readonly GateRow[],
  still: readonly GateRow[],
  fast: ReadonlySet<number>,
  limits: FillLimits,
): number[] {
  const { state, settings } = context;
  const target = Math.min(state.fillTarget ?? settings.fillTarget, settings.fillTarget);
  const held = new Set(still.flatMap((row) => row.pull.files));
  const added: number[] = [];
  const waiting: string[] = [];
  let fastQueued = still.some((row) => fast.has(row.pull.number));
  const short = capacityShort(context);
  const queued = still.map((row) => row.pull.number);
  for (const row of ordered) {
    const isFast = fast.has(row.pull.number);
    // Fast-track rows sort first, so the first other row at the target ends the fill.
    if (!isFast && still.length + added.length >= target) {
      break;
    }
    if (excluded(row, limits)) {
      continue;
    }
    const why = waitReason(context, row, still, held);
    if (why !== undefined) {
      waiting.push(`#${row.pull.number}(${why})`);
      continue;
    }
    const isFix = limits.freeze !== null && matches(limits.freeze, row);
    const wantsJump =
      isFix || (isFast && still.length + added.length > settings.jumpAhead && !fastQueued);
    enqueue(context, row, jumps(context, row, wantsJump, isFix, short), isFast, queued);
    fastQueued ||= isFast;
    for (const path of row.pull.files) {
      held.add(path);
    }
    added.push(row.pull.number);
  }
  if (waiting.length > 0) {
    logLine(context, "fill", `waiting=${waiting.join(" ")}`);
  }
  return added;
}
