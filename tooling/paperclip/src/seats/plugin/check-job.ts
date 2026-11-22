import type { PluginIssuesClient, PluginStateClient, ScopeKey } from "@paperclipai/plugin-sdk";
import {
  defaultPlacementRules,
  type PlacementProposal,
  proposePlacements,
} from "../placement-rules.ts";
import { proposalText } from "../proposal-text.ts";
import { type ReadJobApi, seatsOwner } from "./read-job.ts";
import { type SeatsNowDeps, seatsNow } from "./seats-now.ts";

/** The part of the plugin context `seats.check` uses, so tests can fake it. */
export interface CheckJobApi extends ReadJobApi {
  readonly issues: Pick<PluginIssuesClient, "createComment">;
  readonly state: Pick<PluginStateClient, "get" | "set">;
}

export interface CheckJobDeps extends SeatsNowDeps {
  readonly now: () => Date;
}

/**
 * The `seats.check` job, every 10 minutes, for the company whose settings
 * list the seats: works out the proposal from the stored readings and where
 * each agent is now, and posts it on the board's task only when it differs
 * from the last one posted. It moves no one, whatever **Move agents** says:
 * the board applies the moves (phase 4, HAL-16010, comes later).
 */
export async function runSeatsCheck(ctx: CheckJobApi, deps: CheckJobDeps): Promise<void> {
  const owner = await seatsOwner(ctx);
  if (owner === undefined) {
    return;
  }
  const { companyId, settings } = owner;
  if (settings.proposalTaskId === undefined) {
    ctx.logger.info("seats.check: no task for proposed moves is set, so nothing is proposed.", {
      companyId,
    });
    return;
  }
  const now = deps.now();
  const at = now.toISOString();
  const { seats, placements, agentNames } = await seatsNow(companyId, settings, deps, now);

  const rules = defaultPlacementRules;
  const proposal = proposePlacements(seats, placements, at, rules);
  const key = lastProposalKey(companyId);
  const fingerprint = proposalFingerprint(proposal);
  if (fingerprint === (await ctx.state.get(key))) {
    return;
  }
  const text = proposalText({ proposal, seats, placements, agentNames, rules, at });
  if (text !== undefined) {
    await ctx.issues.createComment(settings.proposalTaskId, text, companyId);
  }
  // Saved after posting, so a failed post is tried again at the next run.
  await ctx.state.set(key, fingerprint);
  ctx.logger.info(
    `seats.check: ${proposal.moves.length} moves and ${proposal.resetAdvice.length} reset advice${text === undefined ? ", nothing to post" : " posted"}.`,
    { companyId },
  );
}

/**
 * What makes two proposals the same: the moves and the reset advice, not
 * the numbers behind them, so a seat that edges from 81% to 82% doesn't post
 * the same moves again. An empty proposal is saved too, so moves that come
 * back after it are posted again.
 */
export function proposalFingerprint(proposal: PlacementProposal): string {
  return JSON.stringify({
    moves: proposal.moves.map((move) => [move.agentId, move.from, move.to ?? null, move.reason]),
    resetAdvice: proposal.resetAdvice,
  });
}

function lastProposalKey(companyId: string): ScopeKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "seats-check",
    stateKey: "last-proposal",
  };
}
