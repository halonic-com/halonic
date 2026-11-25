import { amsterdamTime } from "../amsterdam-time.ts";
/**
 * Part (b) of the board check: every open task that waits on the board,
 * ranked by how many tasks it holds up. A task waits on the board when it
 * is blocked with the board as its owner, or in review with a pending board
 * card. The list carries identifiers, states, counts and times, never a
 * title or any other text an agent wrote.
 */

/** Why a task waits on the board. */
export type WaitReason = "blocked" | "card";

/** One task waiting on the board, as the `board-waiting` document and `board_waiting` list it. */
export interface WaitingTask {
  readonly taskId: string;
  readonly identifier: string;
  readonly reason: WaitReason;
  /** The agent holding the task, or null when the board holds it. */
  readonly holderAgentId: string | null;
  /** Open tasks it holds up, directly and through the chain of blockers. */
  readonly blocks: number;
  /** True when the chain was longer than the board check reads in one pass. */
  readonly blocksAtLeast: boolean;
  /** Since when it waits, as near as Paperclip says: the block or the card, else its last update. */
  readonly since: string;
}

/** What the board check saves after each hourly pass, for `board_waiting`. */
export interface WaitingRecord {
  readonly at: string;
  readonly tasks: readonly WaitingTask[];
  /**
   * The last `board-waiting` body that actually went out. It differs from
   * `tasks` while writes are off, so the first pass after the board turns
   * them on still writes the document.
   */
  readonly sentBody?: string;
}

/** The task fields the waiting check reads. */
export interface OpenTask {
  readonly id: string;
  readonly identifier: string | null;
  readonly status: string;
  readonly assigneeAgentId: string | null;
  readonly assigneeUserId: string | null;
  readonly unblockDescriptor?: { readonly owner: unknown } | null;
  readonly reviewAttention?: {
    readonly paths: readonly { readonly kind: string; readonly since: string | null }[];
  } | null;
  readonly blockedTransitionAt?: Date | string | null;
  readonly updatedAt: Date | string;
}

const iso = (value: Date | string) => new Date(value).toISOString();

/** The pending board card on a task in review, as Paperclip's review attention names it. */
function cardPath(task: OpenTask) {
  return task.reviewAttention?.paths.find((path) => path.kind === "interaction");
}

/**
 * Why `task` waits on the board, or undefined when it doesn't. `pendingCard`
 * answers for a task in review whose listing carries no review attention.
 */
export function waitReason(task: OpenTask, pendingCard: boolean): WaitReason | undefined {
  if (task.status === "blocked") {
    const owner = task.unblockDescriptor?.owner;
    const ownedByBoard =
      task.assigneeUserId != null ||
      (typeof owner === "object" && owner !== null && "userId" in owner);
    return ownedByBoard ? "blocked" : undefined;
  }
  if (task.status === "in_review") {
    return task.assigneeUserId != null || cardPath(task) !== undefined || pendingCard
      ? "card"
      : undefined;
  }
  return undefined;
}

/** Since when `task` waits: the block or the card when Paperclip says, else its last update. */
export function waitingSince(task: OpenTask): string {
  const since = task.status === "blocked" ? task.blockedTransitionAt : cardPath(task)?.since;
  return iso(since ?? task.updatedAt);
}

/** At most this many blocker reads per pass, for all chains together. */
export const chainReadLimit = 300;

/** One task's direct dependents: the open tasks it blocks. */
export type DependentsOf = (taskId: string) => Promise<readonly string[]>;

/**
 * Counts the open tasks `taskId` holds up, directly and through the chain,
 * each once. Stops when `budget` reads are used and says the count is a floor.
 */
export async function countHeldUp(
  taskId: string,
  dependentsOf: DependentsOf,
  budget: { reads: number },
): Promise<{ blocks: number; atLeast: boolean }> {
  const seen = new Set<string>([taskId]);
  const queue = [taskId];
  while (queue.length > 0) {
    if (budget.reads <= 0) {
      return { blocks: seen.size - 1, atLeast: true };
    }
    budget.reads -= 1;
    for (const dependent of await dependentsOf(queue.shift() ?? "")) {
      if (!seen.has(dependent)) {
        seen.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return { blocks: seen.size - 1, atLeast: false };
}

/** Most tasks held up first; on a tie, the one waiting longest. */
export function rankWaiting(tasks: readonly WaitingTask[]): WaitingTask[] {
  return [...tasks].sort((a, b) => b.blocks - a.blocks || a.since.localeCompare(b.since));
}

function blocksText(task: WaitingTask): string {
  const count = `${task.blocks}${task.blocksAtLeast ? "+" : ""}`;
  return task.blocks === 1 && !task.blocksAtLeast ? "holds up 1 task" : `holds up ${count} tasks`;
}

/** One line per task, for the document and the tool. */
export function waitingLine(task: WaitingTask, names: ReadonlyMap<string, string>): string {
  const what = task.reason === "blocked" ? "blocked on the board" : "board card pending";
  const holder =
    task.holderAgentId === null
      ? "held by the board"
      : `held by ${names.get(task.holderAgentId) ?? task.holderAgentId}`;
  return `${task.identifier}: ${what}, ${blocksText(task)}, waiting since ${amsterdamTime(task.since)}, ${holder}`;
}

/** The `board-waiting` document's ranked list, without the time it was written. */
export function waitingDocument(
  tasks: readonly WaitingTask[],
  names: ReadonlyMap<string, string>,
): string {
  const lines = tasks.map((task, index) => `${index + 1}. ${waitingLine(task, names)}`);
  return [
    "# Waiting on the board",
    "",
    "Open tasks blocked with the board as owner, or in review with a pending board card, ranked by how many tasks each holds up (directly and through the chain), longest waiting first on a tie. Written by the board check every hour; no titles or comment text, open a task to read it.",
    "",
    ...(lines.length > 0 ? lines : ["Nothing waits on the board."]),
  ].join("\n");
}

/** Reads a saved record back; anything odd counts as no pass yet. */
export function readWaitingRecord(value: unknown): WaitingRecord | undefined {
  const record = value as Partial<WaitingRecord> | null;
  if (typeof record?.at !== "string" || !Array.isArray(record.tasks)) {
    return undefined;
  }
  return typeof record.sentBody === "string"
    ? { at: record.at, tasks: record.tasks, sentBody: record.sentBody }
    : { at: record.at, tasks: record.tasks };
}
