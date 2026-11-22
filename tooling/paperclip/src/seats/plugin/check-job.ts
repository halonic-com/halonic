import type { PluginIssuesClient, PluginStateClient, ScopeKey } from "@paperclipai/plugin-sdk";
import { agentSeat } from "../agent-seat.ts";
import {
  defaultPlacementRules,
  type PlacementProposal,
  proposePlacements,
} from "../placement-rules.ts";
import { proposalText } from "../proposal-text.ts";
import type { AgentId, SeatId } from "../records.ts";
import { seatStates } from "../seat-state.ts";
import type { PaperclipTables } from "./paperclip-tables.ts";
import { type ReadJobApi, seatsOwner } from "./read-job.ts";
import type { SeatsStore } from "./store.ts";
import type { RecentReadings } from "./stored-readings.ts";

/**
 * How far back the readings go. It covers a whole 5-hour window, so the
 * rates the rules project come from the window the seat is in.
 */
export const readingsLookbackMs = 6 * 60 * 60_000;

/** The part of the plugin context `seats.check` uses, so tests can fake it. */
export interface CheckJobApi extends ReadJobApi {
  readonly issues: Pick<PluginIssuesClient, "createComment">;
  readonly state: Pick<PluginStateClient, "get" | "set">;
}

export interface CheckJobDeps {
  readonly tables: Pick<PaperclipTables, "agentsNow">;
  readonly readings: RecentReadings;
  readonly store: Pick<SeatsStore, "manualResets">;
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
  const since = new Date(now.getTime() - readingsLookbackMs).toISOString();
  const seats = seatStates(
    settings.seats,
    await deps.readings.since(since),
    await deps.store.manualResets(),
    at,
  );

  const placements = new Map<AgentId, SeatId>();
  const agentNames = new Map<AgentId, string>();
  for (const agent of await deps.tables.agentsNow(companyId)) {
    const seatId = agentSeat(agent, settings.seats);
    if (seatId !== undefined) {
      placements.set(agent.agentId, seatId);
    }
    if (agent.name !== undefined) {
      agentNames.set(agent.agentId, agent.name);
    }
  }

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
