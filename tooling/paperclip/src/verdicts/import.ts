import { type CopyAgent, copyTaskOf } from "../pr-tools/approval-copy.ts";
import { judgeApprovals, signedLines } from "../pr-tools/approvals.ts";
import { type AuthorComment, authorOf } from "./author.ts";
import { reviewerName, type VerdictDraft, type VerdictRecord } from "./record.ts";

/**
 * The import of open approvals from their Paperclip copies (HAL-19481, step 1
 * of 2.4 in HAL-19228). Since 26 Nov Liam and Julian post each approval line
 * on the pull request's task too (0.1). A copy becomes a record only when:
 * - the reviewer's agent the settings name (`verdictReviewers`) wrote it,
 *   from a run (Paperclip names the run), and it isn't a receipt;
 * - it was never edited or deleted;
 * - it is on the task the branch names, and names the current head by all
 *   40 characters, with no rebase part;
 * - the same author check (`authorOf`) and the same HAL-14809 rules
 *   (`judgeApprovals`) as `review_verdict` allow it;
 * - the reviewer recorded no verdict on the pull request after writing it:
 *   an import is stored with its own time, so an older approval copy would
 *   otherwise clear a newer change request.
 * Each copy is imported once: its record keeps the comment's id. Everything
 * else waits for a new verdict with `review_verdict`.
 */

/** A task comment, with what the import checks about it. */
export interface ImportComment extends AuthorComment {
  readonly id: string;
  /** The run that wrote it, as Paperclip records it. */
  readonly createdByRunId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deleted: boolean;
}

/** What the import reads about one pull request. */
export interface ImportFacts {
  readonly repo: string;
  readonly pr: number;
  /** The current full head. */
  readonly head: string;
  readonly branch: string;
  readonly ownBranch: boolean;
  readonly openedBy: string;
  readonly teamLogin: string;
  /** The reviewer by the path rules, undefined when the changed files weren't all read. */
  readonly reviewer: "julian" | "liam" | undefined;
  /** Why Nora's approval can't count here (`routineRefusal`), or null when it can. */
  readonly routineRefusal: string | null;
  /** The current head's fingerprint (`changeIdOf`), or null. */
  readonly fingerprint: string | null;
  /** The agent id of each reviewer the settings name, by lower-case name. */
  readonly reviewerIds: Readonly<Record<string, string>>;
  readonly agents: readonly CopyAgent[];
  /** The comments on the task the branch names. */
  readonly comments: readonly ImportComment[];
  /** The pull request's records so far. */
  readonly records: readonly VerdictRecord[];
}

const fullSha = /^[0-9a-f]{40}$/;

function trusted(comment: ImportComment): comment is ImportComment & { createdByRunId: string } {
  return (
    !comment.deleted &&
    comment.origin === "comment" &&
    typeof comment.createdByRunId === "string" &&
    comment.createdByRunId !== "" &&
    comment.updatedAt === comment.createdAt
  );
}

/** The records to add for the pull request's copies not imported yet. */
export function importDrafts(facts: ImportFacts): VerdictDraft[] {
  const task = facts.ownBranch ? copyTaskOf(facts.branch) : undefined;
  if (task === undefined) {
    return [];
  }
  const found = authorOf(facts);
  if ("refusal" in found) {
    return [];
  }
  const imported = new Set(facts.records.flatMap((record) => record.importedFrom ?? []));
  const ids = Object.entries(facts.reviewerIds);
  const newer = (reviewer: string, comment: ImportComment) =>
    facts.records.some(
      (record) =>
        record.reviewer === reviewer && Date.parse(record.at) > Date.parse(comment.createdAt),
    );
  return facts.comments.flatMap((comment): VerdictDraft[] => {
    const reviewer = ids.find(([, id]) => id === comment.authorAgentId)?.[0];
    if (
      reviewer === undefined ||
      !trusted(comment) ||
      imported.has(comment.id) ||
      newer(reviewer, comment)
    ) {
      return [];
    }
    const by = reviewerName(reviewer);
    const line = signedLines(comment.body).find(
      (signed) =>
        signed.by === by &&
        signed.rebaseOf === undefined &&
        fullSha.test(signed.head) &&
        signed.head === facts.head,
    );
    if (line === undefined) {
      return [];
    }
    const [judged] = judgeApprovals([line], { ...facts, author: found.author });
    if (judged?.counts !== true) {
      return [];
    }
    return [
      {
        repo: facts.repo,
        pr: facts.pr,
        head: facts.head,
        fingerprint: facts.fingerprint,
        verdict: "approved",
        reviewer,
        agentId: comment.authorAgentId as string,
        runId: comment.createdByRunId,
        task,
        importedFrom: comment.id,
      },
    ];
  });
}
