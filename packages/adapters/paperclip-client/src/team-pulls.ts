import {
  isAllowedWebLink,
  type MergeGroup,
  type MergeQueue,
  type MessagingAuthor,
  type PullRequest,
  type PullRequestDetail,
  type PullRequestEvent,
  type PullRequestList,
  type PullRequestState,
} from "@halonicjs/ports";
import type { PaperclipIds } from "./ids.ts";
import { asList, asRecord, asRecords, field, type JsonRecord, text } from "./json.ts";

/** An agent as the pull request mapping knows it: its Paperclip ID and its name. */
export interface KnownAgent {
  id: string;
  name: string;
}

/** What the pull request mappers need besides the answers. */
export interface PullContext {
  ids: PaperclipIds;
  /** The connection's Paperclip origin, which `isAllowedWebLink` also allows. */
  origin: string;
  /** Agents by their name in lower case, as a branch names them. */
  agents: ReadonlyMap<string, KnownAgent>;
}

const theBoard = "the board";
const outsideContributor = "outside contributor";
const dayMs = 24 * 60 * 60 * 1000;

function positiveInteger(record: JsonRecord | undefined, name: string): number | undefined {
  const value = field(record, name);
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * Who a summary names as the opener or a reviewer. Only an agent of this
 * company stays an agent; a person is "the board" or "outside contributor",
 * whatever else the answer says, so no login can come through.
 */
function authorOf(context: PullContext, opener: JsonRecord | undefined): MessagingAuthor {
  const name = text(opener, "name") ?? "";
  if (text(opener, "kind") === "agent") {
    const agent = context.agents.get(name.toLowerCase());
    if (agent !== undefined) {
      return { kind: "agent", agent: context.ids.make("agent", agent.id), name: agent.name };
    }
  }
  return { kind: "person", name: name === theBoard ? theBoard : outsideContributor };
}

function reviewerOf(context: PullContext, pull: JsonRecord): MessagingAuthor | undefined {
  const [first] = asList(field(pull, "approvedBy"));
  const agent = typeof first === "string" ? context.agents.get(first.toLowerCase()) : undefined;
  return agent === undefined
    ? undefined
    : { kind: "agent", agent: context.ids.make("agent", agent.id), name: agent.name };
}

function openStateOf(pull: JsonRecord): PullRequestState {
  const counts = asRecord(field(pull, "reviewCounts"));
  const blocking = (field(counts, "blocker") ?? 0) !== 0 || (field(counts, "major") ?? 0) !== 0;
  if (field(pull, "draft") === true) return "draft";
  if (field(pull, "inQueue") === true) return "in-queue";
  if (text(pull, "mergeable") === "no") return "conflicting";
  if (text(pull, "ciOk") === "failure") return "failing";
  if (asList(field(pull, "approvedBy")).length > 0) return "approved";
  if (asRecord(field(pull, "dequeued")) !== undefined) return "dequeued";
  return blocking ? "changes-requested" : "waiting-for-review";
}

function stateOf(pull: JsonRecord): PullRequestState {
  const state = text(pull, "state");
  if (state === "merged" || state === "closed") {
    return state;
  }
  return state === "open" ? openStateOf(pull) : "other";
}

function sinceOf(pull: JsonRecord, state: PullRequestState): string {
  const updated = text(pull, "updatedAt") ?? new Date(0).toISOString();
  if (state === "dequeued") return text(asRecord(field(pull, "dequeued")), "at") ?? updated;
  if (state === "merged") return text(pull, "mergedAt") ?? updated;
  return updated;
}

function reasonOf(pull: JsonRecord, state: PullRequestState): string | undefined {
  if (state === "failing") return text(pull, "failedCheck");
  if (state === "dequeued") return text(asRecord(field(pull, "dequeued")), "reason");
  return undefined;
}

/** The pull request's GitHub page, or nothing when `isAllowedWebLink` refuses it. */
function webLinkOf(context: PullContext, repo: string, number: number): string | undefined {
  const link = `https://github.com/${repo}/pull/${number}`;
  return isAllowedWebLink(link, context.origin) ? link : undefined;
}

/** The merge groups of a repository's queue entries, in queue order, by the group head they share. */
function groupHeads(queue: readonly JsonRecord[]): readonly string[] {
  const heads = queue.flatMap((entry) => text(entry, "groupHead") ?? []);
  return [...new Set(heads)];
}

/** One pull request of a summary; `undefined` when it has no usable number. */
export function toPullRequest(
  context: PullContext,
  repo: string,
  pull: JsonRecord,
  queue: readonly JsonRecord[] = [],
): PullRequest | undefined {
  const number = positiveInteger(pull, "number");
  if (number === undefined) {
    return undefined;
  }
  const state = stateOf(pull);
  const work = text(pull, "work");
  const reviewer = reviewerOf(context, pull);
  const reason = reasonOf(pull, state);
  const entry = queue.find((candidate) => field(candidate, "number") === number);
  const position = positiveInteger(entry, "position");
  const head = text(entry, "groupHead");
  const group = head === undefined ? undefined : groupHeads(queue).indexOf(head) + 1;
  const webLink = webLinkOf(context, repo, number);
  return {
    id: context.ids.make("pull", repo, String(number)),
    source: context.ids.source(),
    repo: repo.split("/").at(-1) ?? repo,
    label: `#${number}`,
    title: text(pull, "title") ?? "",
    author: authorOf(context, asRecord(field(pull, "author"))),
    ...(work === undefined ? {} : { work: context.ids.make("task", work) }),
    ...(reviewer === undefined ? {} : { reviewer }),
    state,
    since: sinceOf(pull, state),
    ...(reason === undefined ? {} : { reason }),
    fastTrack: field(pull, "fastTrack") === true,
    ...(position === undefined
      ? {}
      : { queue: group === undefined ? { position } : { position, group } }),
    ...(webLink === undefined ? {} : { webLink }),
  };
}

/** The repositories of a `github/summary` answer; none before the first snapshot. */
function reposOf(answer: unknown): { asOf: string | undefined; repos: JsonRecord[] } {
  const summary = asRecord(answer);
  return { asOf: text(summary, "takenAt"), repos: asRecords(field(summary, "repos")) };
}

/** Each repository's open pull requests and those merged or closed lately. */
export function toPullRequestLists(context: PullContext, answer: unknown): PullRequestList[] {
  const { asOf, repos } = reposOf(answer);
  if (asOf === undefined) {
    return [];
  }
  return repos.flatMap((record) => {
    const repo = text(record, "repo");
    if (repo === undefined) {
      return [];
    }
    const queue = asRecords(field(record, "queue"));
    const map = (name: string) =>
      asRecords(field(record, name)).flatMap(
        (pull) => toPullRequest(context, repo, pull, queue) ?? [],
      );
    const list: PullRequestList = {
      source: context.ids.source(),
      repo: repo.split("/").at(-1) ?? repo,
      asOf,
      open: map("open"),
      recent: map("recent"),
    };
    return [list];
  });
}

function groupState(entry: JsonRecord | undefined): MergeGroup["state"] {
  const ciOk = text(entry, "groupCiOk");
  if (ciOk === "success") return "passed";
  return ciOk === "failure" ? "failed" : "building";
}

/** An empty queue; runners busy while an entry's jobs wait for one; otherwise running. */
function healthOf(
  queue: readonly JsonRecord[],
  waitingSince: string | undefined,
): MergeQueue["health"] {
  if (queue.length === 0) {
    return "empty";
  }
  return waitingSince === undefined ? "running" : "runners-busy";
}

function minutesBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));
}

/** One repository's queue: its groups, the entries not in a group yet, and today's removals. */
function toMergeQueue(
  context: PullContext,
  record: JsonRecord,
  repo: string,
  asOf: string,
  speed: JsonRecord | undefined,
): MergeQueue {
  const queue = asRecords(field(record, "queue"));
  const idOf = (entry: JsonRecord) =>
    context.ids.make("pull", repo, String(field(entry, "number")));
  const groups = groupHeads(queue).map((head, index): MergeGroup => {
    const members = queue.filter((entry) => text(entry, "groupHead") === head);
    const since = members.flatMap((entry) => text(entry, "enqueuedAt") ?? []).sort()[0];
    return {
      position: index + 1,
      state: groupState(members[0]),
      since: since ?? asOf,
      pullRequests: members.map(idOf),
    };
  });
  const waitingSince = queue.flatMap((entry) => text(entry, "waitingSince") ?? []).sort()[0];
  const median = field(speed, "medianMinutes");
  const pulls = [...asRecords(field(record, "open")), ...asRecords(field(record, "recent"))];
  const removedToday = pulls.flatMap((pull) => {
    const dequeued = asRecord(field(pull, "dequeued"));
    const at = text(dequeued, "at");
    const recent = at !== undefined && Date.parse(asOf) - Date.parse(at) <= dayMs;
    return recent ? [{ pullRequest: idOf(pull), at, reason: text(dequeued, "reason") ?? "" }] : [];
  });
  return {
    source: context.ids.source(),
    repo: repo.split("/").at(-1) ?? repo,
    asOf,
    health: healthOf(queue, waitingSince),
    ...(waitingSince === undefined
      ? {}
      : { runnerWaitMinutes: minutesBetween(waitingSince, asOf) }),
    ...(typeof median === "number" ? { medianMinutesToMerge: median } : {}),
    groups,
    waiting: queue.filter((entry) => text(entry, "groupHead") === undefined).map(idOf),
    removedToday,
  };
}

/** Each repository's merge queue from a `github/summary` answer. */
export function toMergeQueues(context: PullContext, answer: unknown): MergeQueue[] {
  const { asOf, repos } = reposOf(answer);
  if (asOf === undefined) {
    return [];
  }
  const speed = asRecord(field(asRecord(answer), "mergeSpeed"));
  return repos.flatMap((record) => {
    const repo = text(record, "repo");
    return repo === undefined ? [] : [toMergeQueue(context, record, repo, asOf, speed)];
  });
}

/**
 * One pull request with the steps a `github/pr/{number}` answer has times
 * for: queued, dequeued, merged, and each failing check as of the snapshot.
 */
export function toPullRequestDetail(
  context: PullContext,
  answer: unknown,
): PullRequestDetail | undefined {
  const detail = asRecord(answer);
  const asOf = text(detail, "takenAt");
  const repo = text(detail, "repo");
  const pull = asRecord(field(detail, "pull"));
  const queue = asRecord(field(detail, "queue"));
  const pullRequest =
    repo === undefined || pull === undefined
      ? undefined
      : toPullRequest(context, repo, pull, queue === undefined ? [] : [queue]);
  if (asOf === undefined || pullRequest === undefined || pull === undefined) {
    return undefined;
  }
  const events: PullRequestEvent[] = [];
  const queuedAt = text(queue, "enqueuedAt");
  if (queuedAt !== undefined) events.push({ at: queuedAt, kind: "queued", text: "" });
  const dequeued = asRecord(field(pull, "dequeued"));
  const dequeuedAt = text(dequeued, "at");
  if (dequeuedAt !== undefined)
    events.push({ at: dequeuedAt, kind: "dequeued", text: text(dequeued, "reason") ?? "" });
  const mergedAt = text(pull, "mergedAt");
  if (mergedAt !== undefined) events.push({ at: mergedAt, kind: "merged", text: "" });
  for (const check of asList(field(detail, "failingChecks"))) {
    if (typeof check === "string") events.push({ at: asOf, kind: "check-failed", text: check });
  }
  return { asOf, pullRequest, timeline: events.sort((a, b) => a.at.localeCompare(b.at)) };
}
