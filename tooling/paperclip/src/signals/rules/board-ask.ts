/**
 * The board check's ask spotting as a signal rule (HAL-18196, plan HAL-17450
 * rev 5, "Step 2"): from the comments of one pass, the asks it hasn't seen
 * and the Board Checker's task, the actions of that pass. A ToolScript rule
 * like `pr-watcher.ts`: JSON in, an action list out, type imports only, no
 * I/O and time only from `input.now`. It gives the same outcome as
 * `board-check/asks.ts` and `plugin/board-check-asks.ts`, which a parity
 * test holds it to until the board check runs on it.
 */

/** A comment as the rule reads it. Its body is only matched, never copied into an action. */
export interface AskComment {
  readonly id: string;
  readonly taskId: string;
  readonly identifier: string;
  readonly authorAgentId: string | null;
  readonly createdAt: string;
  /** "fast_response" marks Paperclip's own receipts written in an agent's voice. */
  readonly origin: string | null;
  readonly body: string;
}

/** The rule's settings, from the signal file or the defaults. */
export interface BoardAskSettings {
  readonly windowMinutes: number;
  readonly wake: boolean;
}

/** One pass's input. */
export interface BoardAskInput {
  readonly now: string;
  readonly settings: BoardAskSettings;
  /** The Board Checker's task, where an ask wakes it. */
  readonly checkerTaskId: string;
  /** The agent holding that task: its answers name the board too. */
  readonly boardCheckerAgentId: string | null;
  readonly mergerAgentId: string | null;
  /** The comment ids already handled. */
  readonly seen: readonly string[];
  readonly comments: readonly AskComment[];
}

/** An ask found this pass: ids and a time, never the comment's text. */
export interface FoundAsk {
  readonly commentId: string;
  readonly taskId: string;
  readonly identifier: string;
  readonly authorAgentId: string;
  readonly createdAt: string;
}

/** Add new asks to the Board Checker's `board-asks` document, oldest first. */
export interface ListAsksAction {
  readonly kind: "list-asks";
  readonly asks: readonly FoundAsk[];
}

/** Wake the Board Checker once for the batch; Paperclip drops a second wake with the same key. */
export interface AskWakeAction {
  readonly kind: "wake";
  readonly task: string;
  readonly reason: "board_check_ask";
  readonly key: string;
}

/** One thing a pass does. */
export type BoardAskAction = ListAsksAction | AskWakeAction;

/** The board check's pattern, by role only: an ask names "the board", never a person. */
const askPattern =
  /(for the board|board.s (yes|answer|decision|verdict|card)|waiting on the board|needs the board|card (is )?(up|posted)|board card)/i;

/** The Merger's queue requests live on this task; they aren't asks. */
const mergerRequestsTask = "HAL-14388";

/** The line every comment of the board check ends with. */
const signature = "Board check (plugin)";

/** Whether a comment asks the board, the way `isAsk` decides it. */
function isAsk(comment: AskComment, input: BoardAskInput): boolean {
  const author = comment.authorAgentId;
  if (author === null || comment.origin === "fast_response") {
    return false;
  }
  if (author === input.boardCheckerAgentId) {
    return false;
  }
  if (author === input.mergerAgentId && comment.identifier === mergerRequestsTask) {
    return false;
  }
  if (comment.body.includes(signature)) {
    return false;
  }
  const age = Date.parse(input.now) - Date.parse(comment.createdAt);
  return age >= 0 && age <= input.settings.windowMinutes * 60_000 && askPattern.test(comment.body);
}

/**
 * Every action of one pass: the new asks, then one wake for the first of
 * them when `wake` is on; nothing without a new ask.
 *
 * @example
 * decide({ now, settings: { windowMinutes: 12, wake: true }, checkerTaskId: "t", boardCheckerAgentId: null, mergerAgentId: null, seen: [], comments: [] }); // []
 */
export function decide(input: BoardAskInput): BoardAskAction[] {
  const seen = new Set(input.seen);
  const asks = input.comments
    .filter((comment) => !seen.has(comment.id) && isAsk(comment, input))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((comment) => ({
      commentId: comment.id,
      taskId: comment.taskId,
      identifier: comment.identifier,
      authorAgentId: comment.authorAgentId ?? "",
      createdAt: comment.createdAt,
    }));
  const first = asks[0];
  if (first === undefined) {
    return [];
  }
  const list: ListAsksAction = { kind: "list-asks", asks };
  if (!input.settings.wake) {
    return [list];
  }
  return [
    list,
    {
      kind: "wake",
      task: input.checkerTaskId,
      reason: "board_check_ask",
      key: `board-check ask ${first.commentId}`,
    },
  ];
}
