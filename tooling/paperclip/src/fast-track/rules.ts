import { fastTrackLabel, taskOf } from "../pr-tools/queue-state.ts";
import type { OpenFacts, SnapshotLabel, SnapshotPull, SnapshotRepo } from "../snapshot/shape.ts";
import { approvedOnHead, failingToNudge, isBot, isGreen, pendingOf, reviewerOf } from "./checks.ts";

/**
 * The fast-track rules (HAL-15971), worked out from one snapshot: what the
 * board's Fast-track monitor session would say about each pull request with
 * the `fast-track` label, as its rule list on HAL-16003 describes it. No I/O
 * here; `pass.ts` keeps the state and logs the events.
 */

/** A reviewer has this long after the label before the monitor nudges. */
export const reviewAfterMinutes = 30;

/** Approved and green this long, and still not queued, before the Merger is asked. */
export const enqueueAfterMinutes = 10;

/** In the merge queue this long before the monitor looks for what holds it. */
export const queueSlowMinutes = 30;

/** More PRs than this ahead, and a fast-track PR jumps the queue (HAL-15971 point 3). */
export const jumpAhead = 8;

/** Who an event would go to. */
export type Audience = "task" | "board" | "merger";

/** One thing the monitor would say, once per `key`. */
export interface FastTrackEvent {
  readonly repo: string;
  readonly number: number;
  readonly task: string | undefined;
  readonly stage: string;
  /** Says when it is the same event again: the pull request, the stage and its head or queue entry. */
  readonly key: string;
  readonly to: readonly Audience[];
  readonly text: string;
}

/** What the rules remember about a tracked pull request between passes. */
export interface Tracked {
  readonly labelledAt: string | null;
  /** The head that was approved, green and not queued, and since when. */
  readonly readySince: { readonly head: string; readonly at: string } | null;
  /** When it entered the merge queue, while it was there at the last pass. */
  readonly queuedAt: string | null;
}

/** What one repository's rules need besides the snapshot. */
export interface RuleInput {
  readonly repo: SnapshotRepo;
  readonly now: Date;
  /** Tracked pull requests by number, from the last pass. */
  readonly tracked: ReadonlyMap<number, Tracked>;
  /** Pull requests the board or Chief said unblock the queue or CI for everyone. */
  readonly unblocks: ReadonlySet<number>;
  /**
   * The board's GitHub login, the only account whose `fast-track` label counts
   * for a jump (the others all act as `halonic-dev`), from the plugin setting
   * `fastTrackLabelAdder`. Empty: no label counts.
   */
  readonly labelAdder: string;
}

/** The events of one repository and what to remember for the next pass. */
export interface RuleOutput {
  readonly events: readonly FastTrackEvent[];
  readonly tracked: ReadonlyMap<number, Tracked>;
}

function minutesSince(at: string | null, now: Date): number {
  return at === null ? 0 : (now.getTime() - Date.parse(at)) / 60_000;
}

function head12(pull: SnapshotPull): string {
  return pull.head.slice(0, 12);
}

/** One labelled pull request, with what every rule reads about it. */
interface Subject {
  readonly input: RuleInput;
  readonly pull: SnapshotPull;
  readonly open: OpenFacts;
  readonly label: SnapshotLabel;
  readonly task: string | undefined;
  readonly was: Tracked | undefined;
  /** When the label was added, or when a pass first saw it when GitHub doesn't say. */
  readonly labelledAt: string;
}

function eventOf(
  subject: Pick<Subject, "input" | "pull" | "task">,
  stage: string,
  detail: string,
  to: readonly Audience[],
  text: string,
): FastTrackEvent {
  const { repo } = subject.input.repo;
  const pr = `${repo}#${subject.pull.number}`;
  return {
    repo,
    number: subject.pull.number,
    task: subject.task,
    stage,
    key: detail === "" ? `${pr} ${stage}` : `${pr} ${stage}:${detail}`,
    to,
    text,
  };
}

/** Whether the board added the label; never when the board's login isn't set. */
function byBoard(subject: Pick<Subject, "input" | "label">): boolean {
  return subject.input.labelAdder !== "" && subject.label.addedBy === subject.input.labelAdder;
}

function wrongLabelText(by: string | null, labelAdder: string): string {
  if (by === "halonic-dev") {
    return "fast-track was added as halonic-dev: it counts only if Chief or the board allowed it on the task, so check there. Until then it is queued without a jump.";
  }
  if (by === null) {
    return "GitHub doesn't say who added fast-track, so it never counts as allowed: queued without a jump.";
  }
  if (labelAdder === "") {
    return "the board's login isn't set (fastTrackLabelAdder), so no fast-track label counts: queued without a jump.";
  }
  return `fast-track was added by ${by}, not by the board: queued without a jump.`;
}

function labelEvents(subject: Subject): FastTrackEvent[] {
  const by = subject.label.addedBy;
  const events: FastTrackEvent[] = [];
  if (subject.was === undefined) {
    events.push(
      eventOf(
        subject,
        "new",
        "",
        ["board"],
        `fast-track, added by ${by ?? "unknown"} at ${subject.labelledAt}.`,
      ),
    );
  }
  if (!byBoard(subject)) {
    events.push(
      eventOf(
        subject,
        "wrong_label",
        by ?? "unknown",
        ["board", "merger"],
        wrongLabelText(by, subject.input.labelAdder),
      ),
    );
  }
  if (isBot(subject.open.author)) {
    events.push(
      eventOf(
        subject,
        "bot_label",
        "",
        ["board"],
        `a bot's pull request (${subject.open.author}) carries fast-track, which bot pull requests never get (HAL-16033): remove the label.`,
      ),
    );
  }
  return events;
}

function reviewEvents(subject: Subject): FastTrackEvent[] {
  const { pull, open, input } = subject;
  const waited = Math.round(minutesSince(subject.labelledAt, input.now));
  if (
    open.draft ||
    pendingOf(open).length > 0 ||
    approvedOnHead(pull, open) ||
    waited < reviewAfterMinutes
  ) {
    return [];
  }
  const reviewer = reviewerOf(pull);
  return [
    eventOf(
      subject,
      "review_nudge",
      head12(pull),
      ["task", "board"],
      `${reviewer}, please review now: fast-track, ready and not approved on head ${pull.head.slice(0, 7)}, ${waited} min after the label.`,
    ),
  ];
}

function checkEvents(subject: Subject): FastTrackEvent[] {
  const { pull, open, input } = subject;
  if (open.draft) {
    return [];
  }
  return failingToNudge(pull, open, input.repo.defaultBranch).map((name) =>
    eventOf(
      subject,
      "check_fail",
      `${name}:${head12(pull)}`,
      ["task", "board"],
      `\`${name}\` failed on head ${pull.head.slice(0, 7)}: the author fixes it, or says on the task that a fix is on its way.`,
    ),
  );
}

/** Approved, green, ready and not queued on this head, and since when; null when it isn't. */
export function readySinceOf(
  subject: Pick<Subject, "input" | "pull" | "open" | "was">,
): Tracked["readySince"] {
  const { pull, open, input } = subject;
  const ready =
    !open.draft &&
    !open.inQueue &&
    pull.base === input.repo.defaultBranch &&
    approvedOnHead(pull, open) &&
    isGreen(pull, open, input.repo.defaultBranch);
  if (!ready) {
    return null;
  }
  const before = subject.was?.readySince;
  return before?.head === pull.head ? before : { head: pull.head, at: input.now.toISOString() };
}

/** Why it jumps the queue (HAL-15971 point 3), or undefined when it only goes first among those waiting. */
export function jumpReason(subject: Pick<Subject, "input" | "pull" | "label">): string | undefined {
  if (!byBoard(subject)) {
    return undefined;
  }
  if (subject.input.unblocks.has(subject.pull.number)) {
    return "it unblocks the queue or CI for everyone";
  }
  const ahead = subject.input.repo.queue.length;
  return ahead > jumpAhead ? `${ahead} pull requests are ahead of it` : undefined;
}

function enqueueEvents(
  subject: Subject,
  ready: Tracked["readySince"],
  otherInQueue: number | undefined,
): FastTrackEvent[] {
  const waited = Math.round(minutesSince(ready?.at ?? null, subject.input.now));
  // One jump at a time, and a stacked pull request waits for its base (`readySince` needs the default branch).
  if (ready === null || waited < enqueueAfterMinutes || otherInQueue !== undefined) {
    return [];
  }
  const why = jumpReason(subject);
  const how =
    why === undefined
      ? `queue it first among the pull requests waiting to enter, without a jump (${subject.input.repo.queue.length} in the queue)`
      : `queue it with a jump: ${why}`;
  return [
    eventOf(
      subject,
      "enqueue_ask",
      head12(subject.pull),
      ["merger", "board"],
      `approved and green for ${waited} min and not queued: ${how}.`,
    ),
  ];
}

function queueEvents(subject: Subject): FastTrackEvent[] {
  const { input, pull } = subject;
  const entry = input.repo.queue.find((each) => each.number === pull.number);
  if (entry === undefined) {
    const queuedAt = subject.was?.queuedAt ?? null;
    return queuedAt === null
      ? []
      : [
          eventOf(
            subject,
            "group_fail",
            `removed:${queuedAt}`,
            ["task", "board"],
            `left the merge queue without merging (queued at ${queuedAt}): find why, fix it, and it is asked for again once green.`,
          ),
        ];
  }
  const events: FastTrackEvent[] = [];
  const waited = Math.round(minutesSince(entry.enqueuedAt, input.now));
  const where = `position ${entry.position}, ${entry.state}, group ci-ok ${entry.groupCiOk ?? "not formed"}`;
  if (waited >= queueSlowMinutes) {
    events.push(
      eventOf(
        subject,
        "queue_slow",
        entry.enqueuedAt,
        ["task", "board"],
        `${waited} min in the merge queue (${where}): find what holds it.`,
      ),
    );
  }
  if (entry.groupCiOk === "failure" || entry.state === "UNMERGEABLE") {
    events.push(
      eventOf(
        subject,
        "group_fail",
        entry.enqueuedAt,
        ["task", "board"],
        `its merge group fails (${where}): find the failing job's first error.`,
      ),
    );
  }
  return events;
}

function labelOf(pull: SnapshotPull): SnapshotLabel | undefined {
  return pull.open?.labels.find((label) => label.name === fastTrackLabel);
}

function mergedEvent(input: RuleInput, pull: SnapshotPull, was: Tracked): FastTrackEvent {
  const minutes =
    was.labelledAt === null || pull.mergedAt === null
      ? "?"
      : Math.round((Date.parse(pull.mergedAt) - Date.parse(was.labelledAt)) / 60_000);
  return eventOf(
    { input, pull, task: taskOf(input.repo.repo, pull) },
    "merged",
    "",
    ["board"],
    `merged ${minutes} min after the label.`,
  );
}

/**
 * Every event of one repository's `fast-track` pull requests, and what to
 * remember. A pull request stops being tracked when it closes, loses the
 * label or merges; a merge is reported once, as it stops.
 */
export function fastTrackRules(input: RuleInput): RuleOutput {
  const labelled = input.repo.pulls.filter((pull) => labelOf(pull) !== undefined);
  const queuedFast = labelled.find((pull) => pull.open?.inQueue === true)?.number;
  const events: FastTrackEvent[] = [];
  const tracked = new Map<number, Tracked>();
  for (const pull of labelled) {
    const open = pull.open as OpenFacts;
    const label = labelOf(pull) as SnapshotLabel;
    const was = input.tracked.get(pull.number);
    const labelledAt = label.addedAt ?? was?.labelledAt ?? input.now.toISOString();
    const subject: Subject = {
      input,
      pull,
      open,
      label,
      task: taskOf(input.repo.repo, pull),
      was,
      labelledAt,
    };
    const ready = readySinceOf(subject);
    const other = queuedFast === pull.number ? undefined : queuedFast;
    events.push(
      ...labelEvents(subject),
      ...reviewEvents(subject),
      ...checkEvents(subject),
      ...enqueueEvents(subject, ready, other),
      ...queueEvents(subject),
    );
    const entry = input.repo.queue.find((each) => each.number === pull.number);
    tracked.set(pull.number, {
      labelledAt,
      readySince: ready,
      queuedAt: entry?.enqueuedAt ?? null,
    });
  }
  for (const [number, was] of input.tracked) {
    const pull = input.repo.pulls.find((each) => each.number === number);
    if (!tracked.has(number) && pull?.state === "merged") {
      events.push(mergedEvent(input, pull, was));
    }
  }
  return { events, tracked };
}
