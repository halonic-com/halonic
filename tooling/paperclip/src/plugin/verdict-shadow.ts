import type {
  PluginAgentsClient,
  PluginEntitiesClient,
  PluginIssuesClient,
  PluginLogger,
} from "@paperclipai/plugin-sdk";
import type { ShadowDay } from "../merge-control/shadow.ts";
import {
  checkVerdicts,
  type VerdictShadowReader,
  type VerdictShadowSettings,
} from "../merge-control/shadow-verdicts.ts";
import type { MergeSnapshot } from "../merge-control/snapshot.ts";
import { paperclipCopies } from "../verdicts/approval-copies.ts";
import type { ImportComment } from "../verdicts/import.ts";
import { entityVerdicts } from "../verdicts/store.ts";

/**
 * Merge control's shadow comparison of the recorded verdicts with the gate
 * (HAL-19481, `merge-control/shadow-verdicts.ts`), on the plugin context:
 * the records from the plugin's entities, the approvals' copies from the
 * tasks' comments. It writes only the records it imports.
 */

/** The part of the plugin context the comparison uses, so tests can fake it. */
export interface VerdictShadowApi {
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments">;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly entities: Pick<PluginEntitiesClient, "upsert" | "list">;
  readonly logger: Pick<PluginLogger, "error">;
}

function isoOf(value: Date | string): string {
  return new Date(value).toISOString();
}

/** The company's reader for the comparison; the agents are read once per pass. */
export function verdictShadowReader(
  ctx: VerdictShadowApi,
  companyId: string,
  repo: string,
  reviewerIds: Readonly<Record<string, string>>,
): VerdictShadowReader {
  const store = entityVerdicts(ctx.entities, companyId);
  const copies = paperclipCopies(ctx, companyId);
  let agents: ReturnType<VerdictShadowReader["agents"]> | undefined;
  return {
    reviewerIds,
    records: (pr) => store.list(repo, pr),
    append: (draft) => store.append(draft),
    async taskComments(identifier) {
      const issue = await ctx.issues.get(identifier, companyId);
      if (issue === null) {
        return [];
      }
      const comments = await ctx.issues.listComments(issue.id, companyId);
      return comments.map(
        (comment): ImportComment => ({
          id: comment.id,
          authorAgentId: comment.authorAgentId,
          origin: comment.origin,
          body: comment.body,
          createdByRunId: comment.createdByRunId ?? null,
          createdAt: isoOf(comment.createdAt),
          updatedAt: isoOf(comment.updatedAt),
          deleted: comment.deletedAt !== undefined && comment.deletedAt !== null,
        }),
      );
    },
    agents() {
      agents ??= copies.agents();
      return agents;
    },
  };
}

/**
 * The day with this pass's comparisons. Until the board names the reviewers'
 * agents (`verdictReviewers`) nothing can be recorded, so nothing is compared.
 * A failed pass is logged and the day kept as it was.
 */
export async function withVerdictChecks(
  ctx: VerdictShadowApi,
  companyId: string,
  day: ShadowDay,
  snapshot: MergeSnapshot,
  settings: VerdictShadowSettings & { readonly reviewerIds: Readonly<Record<string, string>> },
  now: Date,
): Promise<ShadowDay> {
  if (Object.keys(settings.reviewerIds).length === 0) {
    return day;
  }
  try {
    const reader = verdictShadowReader(ctx, companyId, settings.repo, settings.reviewerIds);
    return { ...day, verdicts: await checkVerdicts(snapshot, day.verdicts, reader, settings, now) };
  } catch (error) {
    ctx.logger.error(
      `Merge control: couldn't compare the recorded verdicts: ${(error as Error).message}`,
      { companyId },
    );
    return day;
  }
}
