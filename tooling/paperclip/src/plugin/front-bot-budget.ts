import type { PluginConfigClient, PluginIssuesClient } from "@paperclipai/plugin-sdk";
import {
  afterCall,
  type CallHealth,
  capReached,
  type DaySpend,
  freshHealth,
  shouldWarn,
  spendDay,
  spendFor,
  stoppedForErrors,
} from "../front-bot/limits.ts";
import type { StateApi } from "../snapshot/store.ts";
import { companyConfig } from "./job.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";

/**
 * The front bot's one budget (HAL-18847 section 4.3): first replies
 * (HAL-19136) and progress notes (HAL-19218) count towards the same $3 a day
 * and the same error stop. Every read-call-write of the budget runs through
 * one {@link Serial}, so neither part counts from a stale total.
 */

/** The part of the plugin context the budget uses. */
export interface BudgetApi extends MetricsApi, StateApi {
  readonly issues: Pick<PluginIssuesClient, "createComment">;
  readonly config: PluginConfigClient;
}

function companyKey(companyId: string, stateKey: "spend" | "health") {
  return { scopeKind: "company", scopeId: companyId, namespace: "front-bot", stateKey } as const;
}

/** The day's spend and call health before a call. */
export interface Budget {
  readonly spend: DaySpend;
  readonly health: CallHealth;
}

/** The budget at `now`, or why no call may be made: the cap or the error stop holds. */
export async function readBudget(
  ctx: BudgetApi,
  companyId: string,
  now: Date,
): Promise<Budget | "cap_reached" | "error_rate"> {
  const stored = (await ctx.state.get(companyKey(companyId, "spend"))) as DaySpend | null;
  const spend = spendFor(stored, spendDay(now));
  if (capReached(spend)) return "cap_reached";
  const health =
    ((await ctx.state.get(companyKey(companyId, "health"))) as CallHealth | null) ?? freshHealth;
  if (stoppedForErrors(health, now)) return "error_rate";
  return { spend, health };
}

/** Records one call's end in the error window. */
export async function recordCall(
  ctx: BudgetApi,
  companyId: string,
  health: CallHealth,
  now: Date,
  failed: boolean,
): Promise<void> {
  await ctx.state.set(companyKey(companyId, "health"), afterCall(health, now, failed));
}

/** Counts a call's cost; tells Chief once a day at 80% of the cap. */
export async function countSpend(
  ctx: BudgetApi,
  companyId: string,
  spend: DaySpend,
  cost: number,
): Promise<void> {
  const next = { ...spend, microUsd: spend.microUsd + cost };
  const warn = shouldWarn(next);
  await ctx.state.set(companyKey(companyId, "spend"), { ...next, warned: next.warned || warn });
  await writeMetrics(ctx, { "front_bot.spend_micro_usd": cost }, { companyId });
  const config = await companyConfig(ctx.config, companyId);
  const chiefTask = config?.["chiefTask"];
  if (warn && typeof chiefTask === "string" && chiefTask !== "") {
    const dollars = (next.microUsd / 1_000_000).toFixed(2);
    const body = `Front bot: $${dollars} spent today, 80% of the $3 daily cap. At $3 it stops until 00:00 UTC.`;
    await ctx.issues.createComment(chiefTask, body, companyId);
  }
}

/** Runs pieces of work one after another, in the order they were handed in. */
export type Serial = <T>(work: () => Promise<T>) => Promise<T>;

/** A fresh {@link Serial}. A failed piece of work doesn't stop the ones after it. */
export function serial(): Serial {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>) => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };
}
