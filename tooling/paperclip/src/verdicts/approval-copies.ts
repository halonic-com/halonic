import type { PluginAgentsClient, PluginIssuesClient } from "@paperclipai/plugin-sdk";
import type { CopyReader } from "../pr-tools/approval-copy.ts";

/**
 * Reads approvals' Paperclip copies (HAL-19324) for `pr_status`, the PR
 * watcher and merge control's shadow diff: a task's comments by its
 * identifier, and the company's agents. Reads only.
 */

/** The part of the plugin context the copies are read through. */
export interface CopiesApi {
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments">;
  readonly agents: Pick<PluginAgentsClient, "list">;
}

/** The host's agents page; the company has far fewer agents. */
const agentsPage = 500;

/** The company's reader of approval copies. */
export function paperclipCopies(ctx: CopiesApi, companyId: string): CopyReader {
  return {
    async taskComments(identifier) {
      const issue = await ctx.issues.get(identifier, companyId);
      if (issue === null) {
        return [];
      }
      const comments = await ctx.issues.listComments(issue.id, companyId);
      return comments.map(({ authorAgentId, body }) => ({ authorAgentId, body }));
    },
    async agents() {
      const agents = await ctx.agents.list({ companyId, limit: agentsPage });
      return agents.map(({ id, urlKey }) => ({ id, urlKey }));
    },
  };
}
