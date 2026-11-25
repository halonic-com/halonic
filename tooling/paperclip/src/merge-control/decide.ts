import { autoLabels } from "./auto-label.ts";
import { logLine, type PassContext, workCopy } from "./context.ts";
import { failedGroups, unjudgedHolds } from "./culprit.ts";
import { fill, fillOrder, trackReady, verifiedFastTrack } from "./fill.ts";
import { gateRow, withSizeHolds } from "./gate.ts";
import { labelNoopReopens } from "./label-noop.ts";
import { notes } from "./notes.ts";
import { queueFirst } from "./order.ts";
import { pruneState } from "./prune.ts";
import { removals } from "./removal.ts";
import { cancelledReruns, flakeReruns, rerunPause, staleRuns, stalledGroups } from "./reruns.ts";
import type { MergeSnapshot } from "./snapshot.ts";
import type { Decision, MergeSettings, MergeState } from "./state.ts";
import { fillPauseOn, mainRedFreeze, runnerBrake } from "./switches.ts";

/**
 * One merge-control pass, as the Merger's `pass.js` runs it, without I/O:
 * the same snapshot, state, settings and time always give the same actions.
 * `act.ts` carries the actions out; the PR watcher keeps the task actions.
 */
export function decide(
  snapshot: MergeSnapshot,
  before: MergeState,
  settings: MergeSettings,
  now: Date,
): Decision {
  const context: PassContext = {
    snapshot,
    settings,
    now,
    state: workCopy(before),
    actions: [],
    log: [],
    cancelled: new Set(),
  };
  const { state } = context;
  pruneState(context);
  const rows = withSizeHolds(
    snapshot.pulls.map((pull) => gateRow(snapshot, pull, settings)),
    snapshot,
    settings.fileSizeLimit,
  );
  const queuedBefore = rows.filter((row) => row.entry !== undefined).map((row) => row.pull.number);
  const merged = state.lastQueue.filter(
    (number) =>
      !queuedBefore.includes(number) && snapshot.merged.some((each) => each.number === number),
  );
  if (merged.length > 0) {
    logLine(context, "merged", `merged=${merged.map((number) => `#${number}`).join(",")}`);
  }

  const removed = removals(context, rows);
  const seenBefore = new Set(state.seenFailedRuns);
  const failedOut = failedGroups(context, rows);
  unjudgedHolds(context, rows, seenBefore);
  labelNoopReopens(context, rows);
  autoLabels(context, rows);
  const fast = verifiedFastTrack(context, rows);
  trackReady(context, rows);
  const pauseOn = fillPauseOn(context, rows);
  const waitFor = state.board.fillPause?.waitFor ?? [];
  const freeze = mainRedFreeze(context);
  const out = [...removed, ...failedOut];
  const still = rows.filter((row) => row.entry !== undefined && !out.includes(row));
  const added = fill(context, fillOrder(context, rows, fast, still), still, fast, {
    pauseOn,
    waitFor,
    freeze,
  });
  staleRuns(context);
  notes(context, rows, added);
  runnerBrake(context);
  const pause = rerunPause(context);
  if (pause === undefined) {
    cancelledReruns(context, rows);
    flakeReruns(context, rows, fast);
  } else {
    logLine(context, "rerun", `paused: ${pause}`);
  }
  stalledGroups(context);

  state.lastQueue = [...still.map((row) => row.pull.number), ...added];
  logLine(
    context,
    "pass",
    `queued=${state.lastQueue.length} removed=${out.map((row) => `#${row.pull.number}`).join(",") || "-"} added=${added.map((number) => `#${number}`).join(",") || "-"} candidatesPassing=${rows.filter((row) => row.entry === undefined && row.pass).length}`,
  );
  return { actions: queueFirst(context.actions), state, log: context.log };
}
