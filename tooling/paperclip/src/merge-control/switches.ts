import { logLine, minutesSince, type PassContext } from "./context.ts";
import type { GateRow } from "./gate.ts";
import { texts } from "./texts.ts";

/**
 * The board's switches that end by themselves, and the runner brake: the
 * fill pause (21 Nov 19:35), the main-red freeze (22 Nov 00:25), the brake
 * on HAL-14785, and the lower fill target while runners are short.
 */

/** Brake on above this wait, off below the next (HAL-14785). */
export const brakeOnMinutes = 5;
export const brakeOffMinutes = 2;
/** Low wait this long restores the full fill target. */
export const restoreTargetMinutes = 30;

/** Whether the fill pause still holds, after ending it when its pull requests are green or time is up. */
export function fillPauseOn(context: PassContext, rows: readonly GateRow[]): boolean {
  const pause = context.state.board.fillPause;
  if (pause === null) {
    return false;
  }
  const green = pause.waitFor.filter((number) => {
    const row = rows.find((each) => each.pull.number === number);
    return row !== undefined && (row.entry !== undefined || row.ci.state === "success");
  });
  const list = (numbers: readonly number[]) => numbers.map((number) => `#${number}`).join(", ");
  if (green.length === pause.waitFor.length || context.now.getTime() >= Date.parse(pause.until)) {
    const why =
      green.length === pause.waitFor.length
        ? `ci-ok green on ${list(pause.waitFor)}`
        : `time limit; green: ${list(green) || "none"}`;
    logLine(context, "fill-pause", `FILL_PAUSE_END (${why})`);
    context.state.board.fillPause = null;
    return false;
  }
  const waiting = pause.waitFor.filter((number) => !green.includes(number));
  logLine(
    context,
    "fill-pause",
    `FILL_PAUSED until ${pause.until.slice(11, 16)} (waiting for ci-ok on ${list(waiting)})`,
  );
  return true;
}

/**
 * The main-red freeze: while on, only pull requests whose title or branch
 * match its pattern go in, with a jump. It ends on the first completed,
 * not cancelled `CI` push run on `main` created after it began, if green.
 * Returns the pattern while it holds.
 */
export function mainRedFreeze(context: PassContext): RegExp | null {
  const freeze = context.state.board.mainRed;
  if (freeze === null) {
    return null;
  }
  const newest = context.snapshot.mainRuns
    .filter(
      (run) =>
        run.status === "completed" &&
        run.createdAt > freeze.since &&
        run.conclusion !== "cancelled",
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (newest?.conclusion === "success") {
    logLine(context, "main-red", `MAIN_GREEN at ${newest.headSha.slice(0, 9)}`);
    context.state.board.mainRed = null;
    return null;
  }
  logLine(context, "main-red", `MAIN_RED freeze: only ${freeze.allowRe} PRs are added`);
  try {
    return new RegExp(freeze.allowRe);
  } catch {
    // A pattern that doesn't compile lets nothing in: the freeze still holds.
    return /$^/;
  }
}

/** The runner brake and the fill target, from the longest runner wait. */
export function runnerBrake(context: PassContext): void {
  const { state } = context;
  const wait = context.snapshot.runnerWaitMinutes;
  if (wait === null) {
    // Never a silent 0.
    logLine(context, "runner-brake", "RUNNER_WAIT_UNREADABLE");
    return;
  }
  if (wait < brakeOffMinutes) {
    state.lowWaitSince ??= context.now.toISOString();
  } else {
    state.lowWaitSince = null;
  }
  if (
    !state.tuneManual &&
    state.fillTarget !== null &&
    state.lowWaitSince !== null &&
    minutesSince(context, state.lowWaitSince) >= restoreTargetMinutes
  ) {
    logLine(
      context,
      "fill-target",
      `TARGET_RESTORED ${context.settings.fillTarget} (was ${state.fillTarget})`,
    );
    state.fillTarget = null;
  }
  if (wait > brakeOnMinutes && state.runnerAlertOn === null) {
    state.runnerAlertOn = context.now.toISOString();
    logLine(context, "runner-brake", texts.brakeOn(Math.round(wait)));
  } else if (wait < brakeOffMinutes && state.runnerAlertOn !== null) {
    state.runnerAlertOn = null;
    logLine(context, "runner-brake", texts.brakeOff);
  }
}
