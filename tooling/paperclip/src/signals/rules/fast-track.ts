import type { QueueEntry, SnapshotPull } from "../../snapshot/shape.ts";
import type { FastTrackCheckInput, PullCheck } from "./fast-track-checks.ts";

/**
 * The fast-track rules as a signal rule (HAL-18320, plan HAL-17450 rev 5,
 * "Step 2"): from one repository's snapshot, the checks of its `fast-track`
 * pull requests (`fast-track-checks.ts`, the first step), what the last pass
 * remembered and the notice keys already reported, the new notices of one
 * pass and what to remember next. A ToolScript rule like `board-ask.ts`:
 * JSON in, an action list out, type imports only, no I/O and time only from
 * `input.now`. It gives the same outcome as `fast-track/rules.ts`, which a
 * parity test holds it to until the plugin runs on it.
 */

/** The rule's settings, from the signal file or the defaults: how long, and how many ahead. */
export interface FastTrackSettings {
  /** Ready for review and not approved this long, and the board hears of it. */
  readonly reviewEscalateMinutes: number;
  /** Approved and green this long, and still not queued, before the Merger is asked. */
  readonly enqueueAfterMinutes: number;
  /** First in the merge queue this long before the holder is asked to look. */
  readonly queueSlowMinutes: number;
  /** More pull requests than this ahead, and a fast-track one jumps. */
  readonly jumpAhead: number;
}

/** What the rule remembers about a labelled pull request between passes. */
export interface Tracked {
  readonly labelledAt: string | null;
  /** The head that was approved, green and not queued, and since when. */
  readonly readySince: { readonly head: string; readonly at: string } | null;
  /** When it entered the merge queue, while it was there at the last pass. */
  readonly queuedAt: string | null;
  /** The head that was ready for review and not approved, and since when. */
  readonly reviewSince?: { readonly head: string; readonly at: string } | null;
  /** Since when its queue entry has been first in the merge queue. */
  readonly firstInQueueSince?: string | null;
}

/** One pass's input for one repository: the first step's input, its result, and more. */
export interface FastTrackInput extends FastTrackCheckInput {
  readonly now: string;
  readonly settings: FastTrackSettings;
  /** `checkPulls` of this same input. */
  readonly checks: readonly PullCheck[];
  /** What the last pass remembered, by pull request number. */
  readonly tracked: Readonly<Record<string, Tracked>>;
  /** The notice keys already reported. */
  readonly reported: readonly string[];
  /** The pull requests the board or Chief marked as unblocking everyone (plugin setting). */
  readonly unblocks: readonly number[];
}

/** Who a notice goes to. */
export type Audience = "task" | "board" | "merger";

/** Say something once about one pull request, keyed by its stage and head or queue entry. */
export interface NoticeAction {
  readonly kind: "notice";
  readonly repo: string;
  readonly number: number;
  readonly task: string | null;
  readonly stage: string;
  readonly key: string;
  readonly to: readonly Audience[];
  readonly text: string;
}

/** Keep this for the next pass: every labelled pull request, by number. */
export interface RememberAction {
  readonly kind: "remember";
  readonly repo: string;
  readonly tracked: Readonly<Record<string, Tracked>>;
}

/** One thing a pass does. */
export type FastTrackAction = NoticeAction | RememberAction;

/** One labelled pull request, with what every step reads about it. */
interface Subject {
  readonly input: FastTrackInput;
  readonly pull: SnapshotPull;
  readonly check: PullCheck;
  readonly was: Tracked | undefined;
  readonly entry: QueueEntry | undefined;
}

type Notice = (
  stage: string,
  detail: string,
  to: readonly Audience[],
  text: string,
) => NoticeAction;

const minutesSince = (at: string | null, now: string) =>
  at === null ? 0 : (Date.parse(now) - Date.parse(at)) / 60_000;

/** A notice about this pull request; its key is the pull request, the stage and the detail. */
function noticeOf(repo: string, number: number, task: string | null): Notice {
  return (stage, detail, to, text) => {
    const pr = `${repo}#${number}`;
    const key = detail === "" ? `${pr} ${stage}` : `${pr} ${stage}:${detail}`;
    return { kind: "notice", repo, number, task, stage, key, to, text };
  };
}

function wrongLabelText(by: string | null, labelAdder: string): string {
  if (by === null) {
    return "GitHub doesn't say who added fast-track, so it never counts as allowed: queued without a jump.";
  }
  if (by === "halonic-dev") {
    return "fast-track was added as halonic-dev, which counts only on the pull requests in fastTrackSharedLabelScope: queued without a jump.";
  }
  if (labelAdder === "") {
    return `the board's login isn't set (fastTrackLabelAdder), so only a fast-track label added as halonic-dev on a listed pull request counts, not ${by}'s: queued without a jump.`;
  }
  return `fast-track was added by ${by}, not by the board or as halonic-dev: queued without a jump.`;
}

function labelNotices({ input, check, was }: Subject, say: Notice, at: string): NoticeAction[] {
  const by = check.labelBy;
  const notices: NoticeAction[] = [];
  if (was === undefined) {
    notices.push(say("new", "", ["board"], `fast-track, added by ${by ?? "unknown"} at ${at}.`));
  }
  if (!check.labelCounts) {
    const text = wrongLabelText(by, input.labelAdder);
    notices.push(say("wrong_label", by ?? "unknown", ["board", "merger"], text));
  }
  if (check.bot) {
    const author = input.repo.pulls.find((pull) => pull.number === check.number)?.open?.author;
    const text = `a bot's pull request (${author}) carries fast-track, which bot pull requests never get (HAL-16033): remove the label.`;
    notices.push(say("bot_label", "", ["board"], text));
  }
  return notices;
}

function reviewNotices(subject: Subject, say: Notice, since: Tracked["reviewSince"]) {
  const { pull, check, input } = subject;
  if (since === null || since === undefined) {
    return [];
  }
  const short = pull.head.slice(0, 7);
  const head12 = pull.head.slice(0, 12);
  const nudge = `${check.reviewer}, please review now: fast-track, ready for review and not approved on head ${short}.`;
  const notices = [say("review_nudge", head12, ["task"], nudge)];
  const waited = Math.round(minutesSince(since.at, input.now));
  if (waited >= input.settings.reviewEscalateMinutes) {
    const text = `still not approved on head ${short} ${waited} min after it was ready for review: ${check.reviewer} hasn't reviewed it.`;
    notices.push(say("review_escalate", head12, ["board"], text));
  }
  return notices;
}

function checkNotices({ pull, check }: Subject, say: Notice): NoticeAction[] {
  if (pull.open?.draft !== false) {
    return [];
  }
  return check.failing.map((name) =>
    say(
      "check_fail",
      `${name}:${pull.head.slice(0, 12)}`,
      ["task", "board"],
      `\`${name}\` failed on head ${pull.head.slice(0, 7)}: the author fixes it, or says on the task that a fix is on its way.`,
    ),
  );
}

/** How to queue it (HAL-15971 point 3, HAL-17697): a jump never passes another queued fast-track one. */
function howToQueue({ input, check }: Subject, other: number | null): string {
  const queued = input.repo.queue.length;
  if (other !== null) {
    return `queue it normally, without a jump: fast-track #${other} is already queued (${queued} in the queue)`;
  }
  if (check.labelCounts && input.unblocks.includes(check.number)) {
    return "queue it with a jump: it unblocks the queue or CI for everyone";
  }
  if (check.labelCounts && queued > input.settings.jumpAhead) {
    return `queue it with a jump: ${queued} pull requests are ahead of it`;
  }
  return `queue it first among the pull requests waiting to enter, without a jump (${queued} in the queue)`;
}

function queueNotices({ input, was, entry }: Subject, say: Notice, first: string | null) {
  if (entry === undefined) {
    const queuedAt = was?.queuedAt ?? null;
    const text = `left the merge queue without merging (queued at ${queuedAt}): find why, fix it, and it is asked for again once green.`;
    return queuedAt === null
      ? []
      : [say("group_fail", `removed:${queuedAt}`, ["task", "board"], text)];
  }
  const notices: NoticeAction[] = [];
  const where = `position ${entry.position}, ${entry.state}, group ci-ok ${entry.groupCiOk ?? "not formed"}`;
  // Waiting behind others is normal without a jump; only a stuck first entry is slow.
  const minutes = Math.round(minutesSince(first, input.now));
  if (first !== null && minutes >= input.settings.queueSlowMinutes) {
    const text = `${minutes} min first in the merge queue (${where}): find what holds it.`;
    notices.push(say("queue_slow", entry.enqueuedAt, ["task", "board"], text));
  }
  if (entry.groupCiOk === "failure" || entry.state === "UNMERGEABLE") {
    const text = `its merge group fails (${where}): find the failing job's first error.`;
    notices.push(say("group_fail", entry.enqueuedAt, ["task", "board"], text));
  }
  return notices;
}

/** The same head keeps its first time; a new head starts now. */
function since(was: Tracked["readySince"] | undefined, head: string, now: string) {
  return was?.head === head ? was : { head, at: now };
}

/** Everything a labelled pull request says this pass, and what to remember about it. */
function pullNotices(subject: Subject, other: number | null) {
  const { input, pull, check, was, entry } = subject;
  const say = noticeOf(input.repo.repo, pull.number, check.task);
  const draft = pull.open?.draft !== false;
  const labelledAt = check.labelAt ?? was?.labelledAt ?? input.now;
  const onBase = pull.base === input.repo.defaultBranch;
  const ready = !draft && pull.open?.inQueue === false && onBase && check.approved && check.green;
  const readySince = ready ? since(was?.readySince, pull.head, input.now) : null;
  const inReview = !draft && !check.pending && !check.approved;
  const reviewSince = inReview ? since(was?.reviewSince, pull.head, input.now) : null;
  const sameEntry = was?.queuedAt === entry?.enqueuedAt;
  const kept = sameEntry ? was?.firstInQueueSince : null;
  const firstInQueueSince = entry?.position === 1 ? (kept ?? input.now) : null;
  const waited = Math.round(minutesSince(readySince?.at ?? null, input.now));
  // A stacked pull request waits for its base (`readySince` needs the default branch).
  const askToQueue = readySince !== null && waited >= input.settings.enqueueAfterMinutes;
  const ask = `approved and green for ${waited} min and not queued: ${howToQueue(subject, other)}.`;
  const notices = [
    ...labelNotices(subject, say, labelledAt),
    ...reviewNotices(subject, say, reviewSince),
    ...checkNotices(subject, say),
    ...(askToQueue ? [say("enqueue_ask", pull.head.slice(0, 12), ["merger", "board"], ask)] : []),
    ...queueNotices(subject, say, firstInQueueSince),
  ];
  const queuedAt = entry?.enqueuedAt ?? null;
  const tracked: Tracked = { labelledAt, readySince, queuedAt, reviewSince, firstInQueueSince };
  return { notices, tracked };
}

/** A merge is said once, as the pull request stops being remembered. */
function mergedNotice(input: FastTrackInput, pull: SnapshotPull, was: Tracked): NoticeAction {
  const at = was.labelledAt;
  const minutes =
    at === null || pull.mergedAt === null ? "?" : Math.round(minutesSince(at, pull.mergedAt));
  // The same task rule as `fast-track-checks.ts`: an own branch named `<agent>/HAL-<n>-…`.
  const own = pull.headRepo?.toLowerCase() === input.repo.repo.toLowerCase();
  const task = own ? (/^[\w.-]+\/([a-z]+-\d+)(?:-|$)/i.exec(pull.branch)?.[1] ?? null) : null;
  const say = noticeOf(input.repo.repo, pull.number, task?.toUpperCase() ?? null);
  return say("merged", "", ["board"], `merged ${minutes} min after the label.`);
}

/**
 * Every new notice of one repository's `fast-track` pull requests, then what
 * to remember. A pull request stops being remembered when it closes, loses
 * the label or merges.
 *
 * @example
 * decide({ ...input, checks: checkPulls(input) }); // [...notices, { kind: "remember", … }]
 */
export function decide(input: FastTrackInput): FastTrackAction[] {
  const pulls = new Map(input.repo.pulls.map((pull) => [pull.number, pull]));
  const queuedFast = input.checks.find((check) => pulls.get(check.number)?.open?.inQueue === true);
  const notices: NoticeAction[] = [];
  const tracked: Record<string, Tracked> = {};
  for (const check of input.checks) {
    const pull = pulls.get(check.number);
    if (pull === undefined) {
      continue;
    }
    const entry = input.repo.queue.find((each) => each.number === check.number);
    const was = input.tracked[String(check.number)];
    const other = queuedFast === undefined || queuedFast === check ? null : queuedFast.number;
    const result = pullNotices({ input, pull, check, was, entry }, other);
    notices.push(...result.notices);
    tracked[String(check.number)] = result.tracked;
  }
  for (const [number, was] of Object.entries(input.tracked)) {
    const pull = pulls.get(Number(number));
    if (tracked[number] === undefined && pull?.state === "merged") {
      notices.push(mergedNotice(input, pull, was));
    }
  }
  const reported = new Set(input.reported);
  const fresh = notices.filter((notice) => !reported.has(notice.key));
  return [...fresh, { kind: "remember", repo: input.repo.repo, tracked }];
}
