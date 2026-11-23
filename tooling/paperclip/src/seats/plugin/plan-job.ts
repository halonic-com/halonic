import type { PluginStateClient, ScopeKey } from "@paperclipai/plugin-sdk";
import { adviseCaps, type CapAdvice } from "../forecast/cap-advice.ts";
import {
  type MoveEffect,
  moveEffects,
  type PlannedMove,
  type ResetEffect,
  resetEffects,
} from "../forecast/effects.ts";
import type { SeatId, WindowKey } from "../forecast/types.ts";
import {
  defaultPlacementRules,
  type MoveReason,
  type ProposedMove,
  proposePlacements,
} from "../placement-rules.ts";
import { counted } from "./calibrate-job.ts";
import { type ForecastInputDeps, forecastInput } from "./forecast-job.ts";
import { type ReadJobApi, seatsOwner } from "./read-job.ts";
import { type SeatsNowDeps, seatsNow } from "./seats-now.ts";

/** The part of the plugin context `seats.plan` uses, so tests can fake it. */
export interface PlanJobApi extends ReadJobApi {
  readonly state: Pick<PluginStateClient, "set">;
}

/** What `seats.plan` reads, so tests can fake it: what `seats.check` and `seats.forecast` read. */
export interface PlanJobDeps extends ForecastInputDeps, Pick<SeatsNowDeps, "tables"> {
  readonly now: () => Date;
}

/** A proposed move with its forecast effect and why the placement rules propose it. */
export interface PricedMove extends MoveEffect {
  readonly reason: MoveReason;
}

/** The newest plan, kept in plugin state for the page: plugin state holds only the latest values. */
export interface LatestPlan {
  readonly madeAt: string;
  readonly moves: readonly PricedMove[];
  /** Moves no seat can take: the proposal says so, and there is nothing to price. */
  readonly withoutTarget: readonly ProposedMove[];
  readonly resets: readonly ResetEffect[];
  /** Undefined when the pool lasts until the next big refill. */
  readonly capAdvice: CapAdvice | undefined;
}

/** Where the newest plan is kept for the page. */
export function latestPlanKey(companyId: string): ScopeKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "seats-plan",
    stateKey: "latest",
  };
}

type TargetedMove = ProposedMove & { readonly to: SeatId };

function hasTarget(move: ProposedMove): move is TargetedMove {
  return move.to !== undefined;
}

/** The windows every seat reads; a per-model weekly window counts once the agent's seat has one. */
const seatWindows: readonly WindowKey[] = ["session", "week"];

/**
 * How many windows the moved agents use that their target seat has no
 * reading for. The effect lists only windows forecast both today and with
 * the move, so such a window is missing from it without a word; the count
 * says how often that happens.
 */
export function unreadTargetWindows(moves: readonly MoveEffect[]): number {
  let unread = 0;
  for (const effect of moves) {
    const windowsOf = (seatId: SeatId | undefined) =>
      effect.windows.filter((change) => change.seatId === seatId).map((change) => change.window);
    const used = new Set([...seatWindows, ...windowsOf(effect.fromSeatId)]);
    const read = new Set(windowsOf(effect.move.toSeatId));
    unread += [...used].filter((window) => !read.has(window)).length;
  }
  return unread;
}

/** The cap advice in the log line: counts only, never which agents. */
export function capAdviceText(advice: CapAdvice | undefined): string {
  if (advice === undefined) {
    return "none";
  }
  const cuts = Object.values(advice.capDelta);
  const runs = -cuts.reduce((sum, delta) => sum + delta, 0);
  const enough = advice.enough ? "enough" : "not enough";
  return `cut ${counted(runs, "run")} for ${counted(cuts.length, "agent")}, ${enough} to last until the next big refill`;
}

/**
 * The `seats.plan` job, every 10 minutes: takes the moves and the reset
 * advice the placement rules propose (the same ones `seats.check` posts),
 * forecasts each one's effect on its own against today's forecast, and adds
 * the cap advice. It keeps the newest plan for the page and logs counts only.
 * It proposes and changes nothing: moves, resets and caps stay the board's.
 */
export async function runSeatsPlan(ctx: PlanJobApi, deps: PlanJobDeps): Promise<void> {
  const owner = await seatsOwner(ctx);
  if (owner === undefined) {
    return;
  }
  const now = deps.now();
  const at = now.toISOString();
  const { seats, placements } = await seatsNow(owner.companyId, owner.settings, deps, now);
  const proposal = proposePlacements(seats, placements, at, defaultPlacementRules);
  const { input, activity } = await forecastInput(deps, owner, now);

  const targeted = proposal.moves.filter(hasTarget);
  const planned = targeted.map(
    (move): PlannedMove => ({ agentId: move.agentId, toSeatId: move.to, at }),
  );
  // `moveEffects` gives one effect per move, in the order it is given them.
  const effects = moveEffects(input, planned);
  const moves = targeted.flatMap((move, index): PricedMove[] => {
    const effect = effects[index];
    return effect === undefined ? [] : [{ ...effect, reason: move.reason }];
  });
  const plan: LatestPlan = {
    madeAt: at,
    moves,
    withoutTarget: proposal.moves.filter((move) => !hasTarget(move)),
    resets: resetEffects(input, proposal.resetAdvice),
    capAdvice: adviseCaps(input, activity),
  };
  await ctx.state.set(latestPlanKey(owner.companyId), plan);
  ctx.logger.info(
    `seats.plan: ${counted(plan.moves.length, "move")} priced, ${counted(plan.withoutTarget.length, "move")} with no seat to go to, ${counted(plan.resets.length, "reset")} priced, ${counted(unreadTargetWindows(plan.moves), "target seat window")} without a reading; cap advice: ${capAdviceText(plan.capAdvice)}.`,
    { companyId: owner.companyId },
  );
}
