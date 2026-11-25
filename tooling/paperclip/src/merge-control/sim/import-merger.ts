import { measuredTimings, minutesBetween, type SimDay, type SimPull, spreadOf } from "./day.ts";

/**
 * The one-off importer (merge controller ADR): a day for the simulator from
 * the Merger's files, before the recorder has history. The queue manager's
 * log says when each pull request was added, merged, dequeued and held as
 * a culprit; the queue snapshots say which were fast-track and how many
 * groups built at once; the fast-track jump log what the jumps cost; the
 * gate report the changed files of the pull requests it still lists.
 */

/** The Merger's files, as text. */
export interface MergerFiles {
  /** `queue-snapshots.jsonl`. */
  readonly snapshots: string;
  /** `queue-manager.log`. */
  readonly log: string;
  /** `jumps.json`, or empty. */
  readonly jumps: string;
  /** `gate-report.json`, or empty. */
  readonly gateReport: string;
}

interface LogPass {
  readonly at: string;
  readonly fields: ReadonlyMap<string, string>;
}

function logPasses(log: string): LogPass[] {
  const passes: LogPass[] = [];
  for (const line of log.split("\n")) {
    const [at, ...parts] = line.split(" | ");
    if (at === undefined || Number.isNaN(Date.parse(at)) || parts[0]?.startsWith("manual:")) {
      continue;
    }
    const fields = new Map<string, string>();
    for (const part of parts) {
      const equals = part.indexOf("=");
      if (equals > 0) {
        fields.set(part.slice(0, equals), part.slice(equals + 1));
      }
    }
    passes.push({ at: new Date(at).toISOString(), fields });
  }
  return passes;
}

interface QueueLine {
  readonly t: string;
  readonly q: readonly { pr: number; state: string; enq: string; ft: boolean }[];
}

function jsonLines(text: string): QueueLine[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as QueueLine);
}

interface JumpEntry {
  readonly pr: number;
  readonly enqueuedAt: string;
  readonly jumped: boolean;
  readonly cancelledGroups?: readonly unknown[];
}

function jumpEntries(text: string): JumpEntry[] {
  if (text.trim() === "") {
    return [];
  }
  const parsed = JSON.parse(text) as { entries?: Record<string, JumpEntry> };
  return Object.values(parsed.entries ?? {});
}

function gateFiles(text: string): Map<number, string[]> {
  if (text.trim() === "") {
    return new Map();
  }
  const parsed = JSON.parse(text) as { rows?: { number: number; files?: string[] }[] };
  return new Map((parsed.rows ?? []).map((row) => [row.number, row.files ?? []]));
}

/** Every pass time at which `pattern` names each pull request in `field`. */
function timesOf(
  passes: readonly LogPass[],
  field: string,
  pattern: RegExp,
): Map<number, string[]> {
  const times = new Map<number, string[]>();
  for (const pass of passes) {
    for (const match of (pass.fields.get(field) ?? "").matchAll(pattern)) {
      const number = Number(match[1]);
      times.set(number, [...(times.get(number) ?? []), pass.at]);
    }
  }
  return times;
}

function first(times: ReadonlyMap<number, readonly string[]>): Map<number, string> {
  return new Map(
    [...times].flatMap(([number, all]) => (all[0] === undefined ? [] : [[number, all[0]]])),
  );
}

/** The pass times of the log on and after `date`: when each pull request was added, merged, dequeued or held. */
function events(passes: readonly LogPass[], date: string) {
  const from = passes.filter((each) => each.at >= date);
  return {
    added: timesOf(from, "added", /#(\d+)/g),
    merged: first(timesOf(from, "merged", /#(\d+)/g)),
    conflicts: first(timesOf(from, "dequeued", /#(\d+)\(conflicts/g)),
    held: first(timesOf(from, "failedGroups", /culprit #(\d+) \(out of queue/g)),
  };
}

/** The day `date` (`YYYY-MM-DD`) from the Merger's files. */
export function importMergerDay(date: string, files: MergerFiles): SimDay {
  const { added, merged, conflicts, held } = events(logPasses(files.log), date);
  const onDay = (at: string) => at.startsWith(date);
  const queueLines = jsonLines(files.snapshots).filter((line) => onDay(line.t));
  const jumps = jumpEntries(files.jumps).filter((each) => onDay(each.enqueuedAt));
  const fast = new Set([
    ...queueLines.flatMap((line) => line.q.filter((each) => each.ft).map((each) => each.pr)),
    ...jumps.map((each) => each.pr),
  ]);
  const changed = gateFiles(files.gateReport);
  const pulls: SimPull[] = [...added]
    .filter(([, times]) => times[0] !== undefined && onDay(times[0]))
    .map(([number, times]) => ({
      number,
      readyAt: times[0] ?? date,
      fastTrack: fast.has(number),
      failsOnce: held.has(number),
      conflictsAt: conflicts.get(number) ?? null,
      files: changed.get(number) ?? [],
    }));
  const enqueued = new Map(
    queueLines.flatMap((line) => line.q.map((each) => [each.pr, each.enq] as const)),
  );
  const timeToMerge = pulls.flatMap((pull) => {
    const at = merged.get(pull.number);
    return at === undefined ? [] : [minutesBetween(pull.readyAt, at)];
  });
  return {
    date,
    pulls,
    timings: measuredTimings({
      enqueueToMerge: [...enqueued].flatMap(([number, enq]) => {
        const at = merged.get(number);
        return at === undefined || at < enq ? [] : [minutesBetween(enq, at)];
      }),
      refix: [...held].flatMap(([number, at]) => {
        const again = added.get(number)?.find((each) => each > at);
        return again === undefined ? [] : [minutesBetween(at, again)];
      }),
      building: queueLines.map(
        (line) => line.q.filter((each) => each.state === "AWAITING_CHECKS").length,
      ),
    }),
    recorded: {
      merged: timeToMerge.length,
      jumps: jumps.filter((each) => each.jumped).length,
      groupsCancelledByJumps: jumps
        .filter((each) => each.jumped)
        .reduce((sum, each) => sum + (each.cancelledGroups?.length ?? 0), 0),
      timeToMerge: spreadOf(timeToMerge),
    },
  };
}
