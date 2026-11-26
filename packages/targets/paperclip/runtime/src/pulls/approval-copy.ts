import type { ActionCall } from "../handlers.ts";
import { type SignedApproval, signedLines } from "./reviews.ts";

/**
 * Whether a signed approval on GitHub has its Paperclip copy: the reviewer's
 * own agent posted the same approval line, naming the full 40-character
 * head, on the task the branch names. Paperclip records which agent wrote a
 * comment, so the copy ties the approval to the reviewer's agent. Detection
 * only: a copy never changes whether an approval counts. The same rule as
 * `tooling/paperclip`'s `pr-tools/approval-copy.ts`.
 */

/** `unknown` when the branch names no task, so there is nowhere to look. */
export type CopyState = "yes" | "no" | "unknown";

/** A task comment, as the copy check reads it. */
export interface CopyComment {
  readonly authorAgentId: string | null;
  readonly body: string;
}

/** A company agent: its id and its url key, the reviewer's name in lower case. */
export interface CopyAgent {
  readonly id: string;
  readonly urlKey: string;
}

/** Where the copies are looked for: the comments on the branch's task, and who the agents are. */
export interface CopySource {
  readonly comments: readonly CopyComment[];
  readonly agents: readonly CopyAgent[];
}

/** How the copies are read from Paperclip; `paperclipCopies` reads them through the call's clients. */
export interface CopyReader {
  /** The comments on the task with this identifier, or undefined when there is no such task. */
  taskComments(identifier: string): Promise<readonly CopyComment[] | undefined>;
  agents(): Promise<readonly CopyAgent[]>;
}

/** The capabilities `paperclipCopies` reads with. */
export const copyCapabilities = ["issues.read", "issue.comments.read", "agents.read"] as const;

/** The host's agents page; a company has far fewer agents. */
const agentsPage = 500;

/** Reads copies through one action call's Paperclip clients, listing the agents once per call. */
export function paperclipCopies({ paperclip, companyId }: ActionCall): CopyReader {
  let agents: Promise<readonly CopyAgent[]> | undefined;
  return {
    async taskComments(identifier) {
      const issue = await paperclip.issues.get(identifier, companyId);
      if (issue === null) {
        return undefined;
      }
      const comments = await paperclip.issues.listComments(issue.id, companyId);
      return comments.map(({ authorAgentId, body }) => ({ authorAgentId, body }));
    },
    agents() {
      agents ??= paperclip.agents
        .list({ companyId, limit: agentsPage })
        .then((list) => list.map(({ id, urlKey }) => ({ id, urlKey })));
      return agents;
    },
  };
}

const fullSha = /^[0-9a-f]{40}$/;

/**
 * Whether the reviewer's own agent wrote the approval on the task: a line
 * "<Name>: approved on head `<sha>`" by that name, whose sha has all 40
 * characters and starts with the head the GitHub line names.
 */
export function hasCopy(approval: SignedApproval, source: CopySource): boolean {
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
export function copyState(approval: SignedApproval, source: CopySource | undefined): CopyState {
  if (source === undefined) {
    return "unknown";
  }
  return hasCopy(approval, source) ? "yes" : "no";
}

/** The approvals, each with its copy state; everything else stays as it was. */
export function withCopies<T extends SignedApproval>(
  approvals: readonly T[],
  source: CopySource | undefined,
): (T & { readonly copy: CopyState })[] {
  return approvals.map((approval) => ({ ...approval, copy: copyState(approval, source) }));
}

/**
 * Reads where a pull request's copies are, or undefined when it names no
 * task or Paperclip has no task by that identifier. A fork's branch can be
 * named like ours, so its task is undefined.
 */
export async function readCopySource(
  reader: CopyReader,
  task: string | undefined,
): Promise<CopySource | undefined> {
  if (task === undefined) {
    return undefined;
  }
  const [comments, agents] = await Promise.all([reader.taskComments(task), reader.agents()]);
  return comments === undefined ? undefined : { comments, agents };
}
