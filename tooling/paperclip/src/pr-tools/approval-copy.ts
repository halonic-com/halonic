import { copyTaskOf } from "../verdicts/branch.ts";
import { type Approval, signedLines } from "./approvals.ts";

/**
 * Whether a signed approval on GitHub has its Paperclip copy (HAL-19324, phase 1
 * of HAL-19228): the reviewer's own agent posted the same approval line, naming
 * the full 40-character head, on the task the branch names. Paperclip records
 * which agent wrote a comment, so the copy ties the approval to the reviewer's
 * agent. Detection only: a copy never changes whether an approval counts.
 */

/** `unknown` when the branch names no task (`<agent>/HAL-<n>-…`), so there is nowhere to look. */
export type CopyState = "yes" | "no" | "unknown";

/** A Paperclip task comment, as the copy check reads it. */
export interface CopyComment {
  readonly authorAgentId: string | null;
  readonly body: string;
}

/** A Paperclip agent: its id and its url key, the reviewer's name in lower case. */
export interface CopyAgent {
  readonly id: string;
  readonly urlKey: string;
}

/** Where the copies are looked for: the comments on the branch's task, and who the agents are. */
export interface CopySource {
  readonly comments: readonly CopyComment[];
  readonly agents: readonly CopyAgent[];
}

/** How the copies are read from Paperclip; the plugin implements it (`verdicts/approval-copies.ts`). */
export interface CopyReader {
  /** The comments on the task with this identifier, or none when there is no such task. */
  taskComments(identifier: string): Promise<readonly CopyComment[]>;
  agents(): Promise<readonly CopyAgent[]>;
}

const fullSha = /^[0-9a-f]{40}$/;

/**
 * Whether the reviewer's own agent wrote the approval on the task: a line
 * "<Name>: approved on head `<sha>`" by that name, whose sha has all 40
 * characters and starts with the head the GitHub line names.
 */
export function hasCopy(
  approval: { readonly by: string; readonly head: string },
  source: CopySource,
): boolean {
  const agent = source.agents.find(({ urlKey }) => urlKey === approval.by.toLowerCase());
  if (agent === undefined) {
    return false;
  }
  const head = approval.head.toLowerCase();
  return source.comments.some(
    (comment) =>
      comment.authorAgentId === agent.id &&
      signedLines(comment.body).some(
        (line) => line.by === approval.by && fullSha.test(line.head) && line.head.startsWith(head),
      ),
  );
}

/** The copy state of one approval; `source` is undefined when the branch names no task. */
export function copyState(
  approval: { readonly by: string; readonly head: string },
  source: CopySource | undefined,
): CopyState {
  if (source === undefined) {
    return "unknown";
  }
  return hasCopy(approval, source) ? "yes" : "no";
}

/**
 * The approvals, each with its copy state; `counts` and the notes stay as they
 * were. An approval on the current head is matched against the pull request's
 * full head, not a prefix of the GitHub line's short sha.
 */
export function withCopies(
  approvals: readonly Approval[],
  source: CopySource | undefined,
  head: string,
): Approval[] {
  return approvals.map((approval) => {
    const onHead = head.toLowerCase().startsWith(approval.head.toLowerCase());
    const matched = onHead ? { by: approval.by, head } : approval;
    return { ...approval, copy: copyState(matched, source) };
  });
}

/**
 * Reads where a branch's copies are, or undefined when it names no task. A
 * fork's branch can be named like ours, so pass undefined for it.
 */
export async function readCopySource(
  reader: CopyReader,
  branch: string | undefined,
): Promise<CopySource | undefined> {
  const task = branch === undefined ? undefined : copyTaskOf(branch);
  if (task === undefined) {
    return undefined;
  }
  const [comments, agents] = await Promise.all([reader.taskComments(task), reader.agents()]);
  return { comments, agents };
}
