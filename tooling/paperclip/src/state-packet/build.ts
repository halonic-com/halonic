import type { PrStatus } from "../pr-tools/pr-status.ts";
import type { CheckState } from "../pr-watcher/decide.ts";
import { discoverPulls } from "../pr-watcher/discover.ts";
import type { Snapshot, SnapshotPull, SnapshotRepo } from "../snapshot/shape.ts";
import { newestComments, type PacketComment, packetText } from "./packet.ts";
import { isFinal, mergedLine, type PullLine, snapshotLine, statusLine } from "./pull-line.ts";

/**
 * Builds the state packet for one monitor wake (HAL-17402, Liam's design
 * review of 24 Nov). The server asks for it just before an
 * `issue_monitor_due` run starts and adds it to the run's prompt, so a
 * wait check decides on its first turn instead of reading `task_get`,
 * `pr_status` and `queue_state` first.
 *
 * It starts from the PR watcher's snapshot. A line older than 5 minutes is
 * read again from GitHub and kept for the next wake. Any failure gives no
 * packet: the run then starts as it does today, never with half a packet.
 */

/** Only this wake gets a packet during the trial (Liam's point 4). */
export const monitorWakeReason = "issue_monitor_due";

/** A line older than this is read again from GitHub before the packet is built. */
export const refreshAfterMs = 5 * 60 * 1000;

/** The whole build gives up after this long, well inside the server's wait. */
export const buildTimeoutMs = 8_000;

/** The branch rule the PR watcher relies on: `<agent>/HAL-<n>-<words>`. */
const watchedBranch = /^[\w.-]+\/[A-Z]+-\d+-\S+$/i;

/** What the server sends. */
export interface PacketRequest {
  readonly companyId: string;
  readonly issueId: string;
  readonly wakeReason: string;
}

/** The packet, or null with the reason there is none (for the log and the tests). */
export type PacketAnswer =
  | { readonly packet: string }
  | { readonly packet: null; readonly reason: string };

/** The two GitHub reads a refresh makes. */
export interface PullReader {
  readonly status: (repo: string, number: number) => Promise<PrStatus>;
  readonly ciOk: (repo: string, commit: string) => Promise<CheckState>;
}

/** Lines read since the snapshot, kept between wakes (`fresh-store.ts`). */
export interface FreshLines {
  readonly get: (companyId: string, repo: string, number: number) => Promise<PullLine | undefined>;
  readonly set: (companyId: string, line: PullLine) => Promise<void>;
}

/** What the build reads, so tests can fake it. */
export interface PacketDeps {
  /** The `statePacket` setting; off by default. */
  readonly enabled: (companyId: string) => Promise<boolean>;
  readonly taskIdentifier: (issueId: string, companyId: string) => Promise<string | undefined>;
  readonly snapshot: (companyId: string) => Promise<Snapshot | undefined>;
  readonly fresh: FreshLines;
  readonly github: (companyId: string) => Promise<PullReader>;
  /** The task's comments, in any order. */
  readonly comments: (issueId: string, companyId: string) => Promise<readonly PacketComment[]>;
  readonly now: () => Date;
}

/** A pull request of the task, with its repository's merge queue. */
interface TaskPull {
  readonly repo: SnapshotRepo;
  readonly pull: SnapshotPull;
}

/** The task's pull requests on `<agent>/HAL-<n>-<words>` branches, from the snapshot. */
export function taskPulls(snapshot: Snapshot, task: string): TaskPull[] {
  const refs = discoverPulls(snapshot).get(task) ?? [];
  return refs.flatMap((ref) => {
    const repo = snapshot.repos.find((listed) => listed.repo === ref.repo);
    const pull = repo?.pulls.find((listed) => listed.number === ref.number);
    return repo !== undefined && pull !== undefined && watchedBranch.test(pull.branch)
      ? [{ repo, pull }]
      : [];
  });
}

function ageMs(line: PullLine, now: Date): number {
  return now.getTime() - Date.parse(line.dataAsOf);
}

/**
 * A line already known: the kept one when it is final or newer than the
 * snapshot, else the snapshot's (none for a merged pull request).
 */
function knownLine(found: TaskPull, takenAt: string, kept: PullLine | undefined) {
  if (kept !== undefined && (isFinal(kept) || Date.parse(kept.dataAsOf) > Date.parse(takenAt))) {
    return kept;
  }
  return snapshotLine(found.repo.repo, found.pull, found.repo.queue, takenAt);
}

/** Reads one pull request's line from GitHub. */
async function readLine(found: TaskPull, reader: PullReader, now: Date): Promise<PullLine> {
  const { repo, pull } = found;
  const readAt = now.toISOString();
  if (pull.state === "merged" && pull.mergeCommit !== null) {
    const ciOk = await reader.ciOk(repo.repo, pull.mergeCommit);
    return mergedLine(repo.repo, pull.number, pull.mergeCommit, ciOk, readAt);
  }
  return statusLine(await reader.status(repo.repo, pull.number), repo.queue, readAt);
}

/** The pull request's line, read again and kept when the known one is missing or old. */
async function lineFor(
  found: TaskPull,
  snapshot: Snapshot,
  companyId: string,
  deps: PacketDeps,
  reader: () => Promise<PullReader>,
  now: Date,
): Promise<PullLine> {
  const kept = await deps.fresh.get(companyId, found.repo.repo, found.pull.number);
  const known = knownLine(found, snapshot.takenAt, kept);
  if (known !== undefined && (isFinal(known) || ageMs(known, now) <= refreshAfterMs)) {
    return known;
  }
  const line = await readLine(found, await reader(), now);
  await deps.fresh.set(companyId, line);
  return line;
}

/** The task's newest comments, newest first. */
function newest(comments: readonly PacketComment[]): PacketComment[] {
  return [...comments]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, newestComments);
}

async function build(request: PacketRequest, deps: PacketDeps): Promise<PacketAnswer> {
  const { companyId, issueId } = request;
  if (request.wakeReason !== monitorWakeReason) {
    return { packet: null, reason: `not a monitor wake (${request.wakeReason})` };
  }
  if (!(await deps.enabled(companyId))) {
    return { packet: null, reason: "the statePacket setting is off" };
  }
  const task = await deps.taskIdentifier(issueId, companyId);
  if (task === undefined) {
    return { packet: null, reason: "task not found" };
  }
  const snapshot = await deps.snapshot(companyId);
  if (snapshot === undefined) {
    return { packet: null, reason: "no GitHub snapshot yet" };
  }
  const found = taskPulls(snapshot, task);
  if (found.length === 0) {
    return {
      packet: null,
      reason: `${task} has no pull request on an <agent>/${task}-<words> branch`,
    };
  }
  const now = deps.now();
  // GitHub is set up only when a line has to be read again.
  let github: Promise<PullReader> | undefined;
  const reader = () => {
    github ??= deps.github(companyId);
    return github;
  };
  const lines = await Promise.all(
    found.map((pull) => lineFor(pull, snapshot, companyId, deps, reader, now)),
  );
  const comments = newest(await deps.comments(issueId, companyId));
  const packet = packetText(task, now.toISOString(), lines, comments);
  return packet === undefined
    ? { packet: null, reason: "its pull request lines alone are over the cap" }
    : { packet };
}

/** Rejects once `ms` have passed. */
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`took longer than ${ms / 1000} s`)), ms).unref?.();
  });
}

/** The packet for one wake, or null with the reason. It never throws. */
export async function statePacket(
  request: PacketRequest,
  deps: PacketDeps,
  timeoutMs = buildTimeoutMs,
): Promise<PacketAnswer> {
  try {
    return await Promise.race([build(request, deps), timeout(timeoutMs)]);
  } catch (error) {
    return { packet: null, reason: `couldn't build it: ${(error as Error).message}` };
  }
}
