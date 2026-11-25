import type { MergeQueue, MessagingId, Seat } from "@halonicjs/ports";
import { type SeatProblem, type SeatProblemKind, seatProblems } from "./seat-problems.ts";
import { formatDayTime, formatTime, type TeamClock } from "./team-format.ts";
import { teamWords } from "./team-words.ts";

/**
 * One Inbox notice about a seat (requirement `team.notices`). It is worked out
 * from the seats each time, never stored, so it keeps its `id` (the seat's)
 * as it changes and leaves once the seat has no problem.
 */
export interface TeamNotice {
  readonly id: MessagingId;
  readonly kind: SeatProblemKind;
  readonly title: string;
  readonly line: string;
  /** Only the 80% notice is quiet: it is in the Inbox but never notifies (Choice S3). */
  readonly quiet: boolean;
}

/** One desktop notification's words, and the seat or merge queue it is about. */
export interface TeamAlert {
  readonly about: { kind: "seat" | "merge-queue"; id: MessagingId };
  readonly title: string;
  readonly body: string;
}

/** What the notices and notifications are worked out from: one read of `TeamStatus`. */
export interface TeamReading {
  readonly seats: readonly Seat[];
  readonly queues: readonly MergeQueue[];
}

/** A queue held up for this long notifies (the architecture note, 1.4). */
const heldUpMinutes = 5;

/**
 * The Inbox notices for the seats, worst first, in HAL-17515's S19 words.
 * A seat that isn't read gets none: Spend and seats shows it, and its old
 * reading would say nothing new.
 */
export function teamNotices(seats: readonly Seat[], clock: TeamClock): readonly TeamNotice[] {
  return seatProblems(seats, clock.now())
    .filter((problem) => problem.kind !== "not-read")
    .map((problem) => {
      const [title, line] = noticeLines(problem, clock);
      return { id: problem.seat.id, kind: problem.kind, title, line, quiet: problem.quiet };
    });
}

/**
 * The notifications for what changed between two readings: a seat that goes
 * into 90% (or reaching it within an hour), into full or signed out, and a
 * merge queue whose runners have been busy for 5 minutes (requirement
 * `team.notifications`). A reading compared with itself gives none, so each
 * change notifies once.
 */
export function teamAlerts(
  before: TeamReading,
  after: TeamReading,
  clock: TeamClock,
): readonly TeamAlert[] {
  return [
    ...seatAlerts(before.seats, after.seats, clock),
    ...queueAlerts(before.queues, after.queues),
  ];
}

/**
 * The reading the next one is compared with: `after`, except that a seat it
 * couldn't read keeps how it was in `before`, so a seat at 90% that isn't read
 * once and then is again doesn't notify a second time.
 */
export function teamBaseline(before: TeamReading, after: TeamReading): TeamReading {
  const was = new Map(before.seats.map((seat) => [seat.id, seat]));
  const seats = after.seats.map((seat) =>
    seat.state === "not-read" ? (was.get(seat.id) ?? seat) : seat,
  );
  return { seats, queues: after.queues };
}

function seatAlerts(
  before: readonly Seat[],
  after: readonly Seat[],
  clock: TeamClock,
): TeamAlert[] {
  const now = clock.now();
  const was = new Map(
    seatProblems(before, now).map((problem) => [problem.seat.id, alertLevel(problem.kind)]),
  );
  return seatProblems(after, now)
    .filter((problem) => {
      const level = alertLevel(problem.kind);
      return level !== undefined && level !== was.get(problem.seat.id);
    })
    .map((problem) => {
      const [title, body] = alertLines(problem, clock);
      return { about: { kind: "seat", id: problem.seat.id }, title, body };
    });
}

/** The problems that notify; 90% and reaching it soon are one level, so moving between them is quiet. */
function alertLevel(kind: SeatProblemKind): "ninety" | "full" | "signed-out" | undefined {
  if (kind === "at-90" || kind === "reaches-90-soon") return "ninety";
  if (kind === "full" || kind === "signed-out") return kind;
  return undefined;
}

/** A notification opens a source's merge queue, so a source notifies once, however many of its repos are held up. */
function queueAlerts(before: readonly MergeQueue[], after: readonly MergeQueue[]): TeamAlert[] {
  const heldBefore = new Set(before.filter(isHeldUp).map((queue) => queue.source));
  const firstHeld = new Map<MessagingId, MergeQueue>();
  for (const queue of after.filter(isHeldUp)) {
    if (!heldBefore.has(queue.source) && !firstHeld.has(queue.source)) {
      firstHeld.set(queue.source, queue);
    }
  }
  return [...firstHeld.values()].map((queue) => ({
    about: { kind: "merge-queue", id: queue.source },
    title: teamWords.notice.queueHeld,
    body: teamWords.notice.queueHeldLine(queue.runnerWaitMinutes ?? 0, pullRequestsIn(queue)),
  }));
}

function isHeldUp(queue: MergeQueue): boolean {
  return queue.health === "runners-busy" && (queue.runnerWaitMinutes ?? 0) >= heldUpMinutes;
}

function pullRequestsIn(queue: MergeQueue): number {
  const inGroups = queue.groups.reduce((sum, group) => sum + group.pullRequests.length, 0);
  return inGroups + queue.waiting.length;
}

/** The words both a notice and a notification use: what is wrong, and the parts of the line. */
function seatWords(problem: SeatProblem, clock: TeamClock) {
  const { seat, week } = problem;
  const resetsAt = week?.resetsAt === undefined ? undefined : formatDayTime(week.resetsAt, clock);
  const words = teamWords.problem;
  const fullTitle =
    resetsAt === undefined
      ? `${seat.label} · ${teamWords.state.full()}`
      : words.full(seat.label, resetsAt);
  return {
    resetsAt,
    agents: teamWords.agentsOn(seat.agents.length),
    stillOn: teamWords.agentsStillOn(seat.agents.length),
    since: words.since(formatTime(seat.asOf, clock)),
    fullTitle,
    signedOut: words.signedOut(seat.label),
    // Only a seat reaching 90% soon has this time; formatting a missing one would throw.
    reaches90:
      week?.reaches90At === undefined
        ? seat.label
        : teamWords.notice.reaches90(seat.label, formatTime(week.reaches90At, clock)),
    used: words.used(seat.label, Math.round(week?.usedPercent ?? 0)),
  };
}

/** A notice's two lines (S19). */
function noticeLines(problem: SeatProblem, clock: TeamClock): [string, string] {
  const words = seatWords(problem, clock);
  switch (problem.kind) {
    case "full":
      return [words.fullTitle, words.stillOn];
    case "signed-out":
      return [words.signedOut, `${words.since} · ${words.agents}`];
    case "not-read":
      // Left out of the notices; kept so the switch covers every kind.
      return [teamWords.problem.notRead(problem.seat.label), words.agents];
    case "reaches-90-soon":
      return [words.reaches90, words.agents];
    case "at-90":
    case "at-80":
      return [
        words.used,
        words.resetsAt === undefined ? words.agents : teamWords.problem.resets(words.resetsAt),
      ];
  }
}

/** A notification's title and line (S20). */
function alertLines(problem: SeatProblem, clock: TeamClock): [string, string] {
  const words = seatWords(problem, clock);
  const withResets =
    words.resetsAt === undefined
      ? words.agents
      : `${words.agents} · ${teamWords.notice.resets(words.resetsAt)}`;
  if (problem.kind === "reaches-90-soon") return [words.reaches90, withResets];
  if (problem.kind === "at-90") return [words.used, withResets];
  return noticeLines(problem, clock);
}
