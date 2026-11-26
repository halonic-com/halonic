import type { PluginEntityRecord, PluginEntityUpsert } from "@paperclipai/plugin-sdk";

/**
 * A reviewer's verdict as the plugin records it (HAL-19481, phase 2 of
 * HAL-19228): one plugin entity per verdict, written by `review_verdict`
 * and never changed. Paperclip names the agent and the run that called the
 * tool, so a record ties the verdict to the reviewer's own run, which a line
 * of GitHub text can't.
 */

/** What a reviewer can record. `withdrawn` takes back the caller's own change request. */
export const verdictKinds = ["approved", "changes-requested", "withdrawn", "security-ok"] as const;

export type VerdictKind = (typeof verdictKinds)[number];

/** One recorded verdict. */
export interface VerdictRecord {
  /** The entity's id, which Paperclip gives each new record. */
  readonly id: string;
  readonly repo: string;
  readonly pr: number;
  /** The full 40-character head the reviewer named, which was the head when it was recorded. */
  readonly head: string;
  /**
   * The fingerprint of the pull request's whole diff against its merge base
   * at that head (`changeIdOf`), or null when GitHub couldn't give one.
   */
  readonly fingerprint: string | null;
  readonly verdict: VerdictKind;
  /** The reviewer's name in lower case, as the settings name the agent (`liam`). */
  readonly reviewer: string;
  readonly agentId: string;
  readonly runId: string;
  /** The task the reviewer's run held, as `HAL-<n>`. */
  readonly task: string;
  /** When Paperclip stored it. */
  readonly at: string;
  /**
   * For an approval imported from its Paperclip copy (2.4 of HAL-19228): the
   * id of the reviewer's task comment it came from. Left out for a verdict
   * the reviewer recorded with `review_verdict`.
   */
  readonly importedFrom?: string;
}

/** A record before Paperclip stores it. */
export type VerdictDraft = Omit<VerdictRecord, "id" | "at">;

/** The entity type of one pull request's verdicts, so a list reads only that pull request's. */
export function verdictEntityType(repo: string, pr: number): string {
  return `review-verdict ${repo}#${pr}`;
}

/**
 * The entity that stores a new record. Paperclip's upsert changes the entity
 * with the same external id, so each record gets a new random one (`externalId`)
 * and an upsert always adds.
 */
export function verdictEntity(
  draft: VerdictDraft,
  companyId: string,
  externalId: string,
): PluginEntityUpsert {
  return {
    entityType: verdictEntityType(draft.repo, draft.pr),
    scopeKind: "company",
    scopeId: companyId,
    externalId,
    title: `${draft.reviewer} ${draft.verdict} ${draft.repo}#${draft.pr}`,
    data: { ...draft },
  };
}

const fullSha = /^[0-9a-f]{40}$/;

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * The record an entity holds, or undefined when it isn't a verdict of this
 * pull request, or was changed after Paperclip stored it: the plugin never
 * changes a record, so a changed one wasn't written by the tool.
 */
export function readVerdict(
  entity: PluginEntityRecord,
  repo: string,
  pr: number,
  companyId: string,
): VerdictRecord | undefined {
  const data = entity.data;
  const { head, fingerprint, verdict, reviewer, agentId, runId, task, importedFrom } = data;
  const valid =
    entity.entityType === verdictEntityType(repo, pr) &&
    entity.scopeKind === "company" &&
    entity.scopeId === companyId &&
    entity.updatedAt === entity.createdAt &&
    data["repo"] === repo &&
    data["pr"] === pr &&
    typeof head === "string" &&
    fullSha.test(head) &&
    (fingerprint === null || isText(fingerprint)) &&
    verdictKinds.includes(verdict as VerdictKind) &&
    isText(reviewer) &&
    isText(agentId) &&
    isText(runId) &&
    isText(task) &&
    (importedFrom === undefined || isText(importedFrom));
  if (!valid) {
    return undefined;
  }
  return {
    id: entity.id,
    repo,
    pr,
    head,
    fingerprint,
    verdict: verdict as VerdictKind,
    reviewer,
    agentId,
    runId,
    task,
    at: entity.createdAt,
    ...(importedFrom === undefined ? {} : { importedFrom }),
  };
}

/** The reviewer's name as the approval lines write it: `liam` is `Liam`. */
export function reviewerName(reviewer: string): string {
  return `${reviewer.charAt(0).toUpperCase()}${reviewer.slice(1)}`;
}

/** The line a verdict reads as on a task or a pull request, with the full head. */
export function verdictLine(record: Pick<VerdictRecord, "reviewer" | "verdict" | "head">): string {
  const words: Record<VerdictKind, string> = {
    approved: "approved",
    "changes-requested": "changes requested",
    withdrawn: "change request withdrawn",
    "security-ok": "security OK",
  };
  return `${reviewerName(record.reviewer)}: ${words[record.verdict]} on head \`${record.head}\``;
}
