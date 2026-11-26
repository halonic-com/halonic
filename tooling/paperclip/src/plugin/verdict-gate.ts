import type {
  PluginAgentsClient,
  PluginEntitiesClient,
  PluginIssuesClient,
} from "@paperclipai/plugin-sdk";
import { gateVerdictPullOf } from "../merge-control/approval-side.ts";
import type { MergeSnapshot } from "../merge-control/snapshot.ts";
import type { RecordedGate, RecordedSource } from "../verdicts/gate.ts";
import { recordedGateOf } from "../verdicts/gate-read.ts";
import { entityVerdicts } from "../verdicts/store.ts";
import { paperclipCopies } from "./approval-copies.ts";

/**
 * The gates on the recorded verdicts (HAL-19969), on the plugin context: the
 * records from the plugin's entities, the author check's comments from the
 * pull request's task, the company's agents. Reads only. The merge gate and
 * `pr_status` use it once the board's flag (`verdictGate`) is on.
 */

/** The part of the plugin context the gates read through, so tests can fake it. */
export interface VerdictGateApi {
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments">;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly entities: Pick<PluginEntitiesClient, "upsert" | "list">;
}

/** The company's source for `recordedGateOf`. */
export function recordedSourceOf(
  ctx: VerdictGateApi,
  companyId: string,
  teamLogin: string,
): RecordedSource {
  const copies = paperclipCopies(ctx, companyId);
  return {
    store: entityVerdicts(ctx.entities, companyId),
    teamLogin,
    async taskComments(identifier) {
      const issue = await ctx.issues.get(identifier, companyId);
      if (issue === null) {
        return [];
      }
      const comments = await ctx.issues.listComments(issue.id, companyId);
      // The author check counts only comments whose origin is `comment`.
      return comments.map(({ authorAgentId, origin, body }) => ({ authorAgentId, origin, body }));
    },
    agents: () => copies.agents(),
  };
}

/**
 * The snapshot with what the recorded verdicts say about each pull request,
 * for the merge gate. Each read that fails leaves its pull request not approved.
 */
export async function withRecordedVerdicts(
  ctx: VerdictGateApi,
  companyId: string,
  snapshot: MergeSnapshot,
  settings: { readonly repo: string; readonly teamLogin: string },
): Promise<MergeSnapshot> {
  const source = recordedSourceOf(ctx, companyId, settings.teamLogin);
  let agents: ReturnType<RecordedSource["agents"]> | undefined;
  const once: RecordedSource = {
    ...source,
    agents() {
      agents ??= source.agents();
      return agents;
    },
  };
  const recorded: Record<string, RecordedGate> = {};
  for (const pull of snapshot.pulls) {
    const facts = gateVerdictPullOf(pull, settings.repo, snapshot.patchIds);
    recorded[String(pull.number)] = await recordedGateOf(once, facts);
  }
  return { ...snapshot, recorded };
}
