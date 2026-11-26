import { randomUUID } from "node:crypto";
import type { PluginEntitiesClient } from "@paperclipai/plugin-sdk";
import {
  readVerdict,
  type VerdictDraft,
  type VerdictRecord,
  verdictEntity,
  verdictEntityType,
} from "./record.ts";

/**
 * Where verdicts are kept: plugin entities, one per verdict (HAL-19481). Only
 * appends and reads: there is no change or delete, so two reviewers writing
 * at the same moment each add their own record and lose nothing.
 */
export interface VerdictStore {
  append(draft: VerdictDraft): Promise<VerdictRecord>;
  /**
   * The pull request's records, oldest first by Paperclip's time; a changed or
   * malformed entity is left out. Records stored in the same instant keep no
   * order between them (they are sorted by id), which only two reviewers
   * writing at once can cause: each reviewer's own calls follow each other.
   */
  list(repo: string, pr: number): Promise<VerdictRecord[]>;
}

/** The host's entities page; one pull request has a handful of verdicts. */
const entitiesPage = 200;

/** The company's verdicts, in the plugin's entities. */
export function entityVerdicts(
  entities: Pick<PluginEntitiesClient, "upsert" | "list">,
  companyId: string,
): VerdictStore {
  return {
    async append(draft) {
      const stored = await entities.upsert(verdictEntity(draft, companyId, randomUUID()));
      const record = readVerdict(stored, draft.repo, draft.pr, companyId);
      if (record === undefined) {
        throw new Error("Paperclip stored the verdict in a shape the reader doesn't accept.");
      }
      return record;
    },
    async list(repo, pr) {
      const found = [];
      for (let offset = 0; ; offset += entitiesPage) {
        const page = await entities.list({
          entityType: verdictEntityType(repo, pr),
          scopeKind: "company",
          scopeId: companyId,
          limit: entitiesPage,
          offset,
        });
        found.push(...page);
        if (page.length < entitiesPage) {
          break;
        }
      }
      return found
        .flatMap((entity) => readVerdict(entity, repo, pr, companyId) ?? [])
        .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    },
  };
}
