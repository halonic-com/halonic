// The usage object's refusals as the Meter's stops (requirement `runtime.usage-meter`). The object
// counts in whole base units (cost in millionths, harness time in ms); a stop names the Meter's
// units (cost in the plan's currency, harness time in minutes).

import type { UsageAmounts, UsageRefusal, UsageUnit } from "@halonicjs/adapter-cloudflare-durable";
import {
  concurrencyStop,
  memberLimitStop,
  memberRemovedStop,
  noPlanStop,
  type PlanStop,
  planLimitStop,
  type StopPlan,
  suspendedStop,
} from "@halonicjs/engine";

/** How many of the object's cost units make one of the plan's currency. */
export const costBase = 1_000_000;

/** How many of the object's harness units (ms) make one of the Meter's minutes. */
export const minuteBase = 60_000;

/**
 * The plan a stop names when the limits document carries none. A stop says it can be upgraded only
 * when the object's refusal says so; a document that doesn't say counts as no bigger plan.
 */
export const cloudPlan: StopPlan = { id: "cloud", version: 0, name: "" };

/** An amount the Meter gives, in the object's base: cost in millionths, minutes in ms. */
export function toBase(unit: "cost" | "harnessMs", amount: number): number {
  return Math.round(amount * (unit === "cost" ? costBase : minuteBase));
}

/** The stop for a refusal the object answered; `phase` is `reserve` when a reservation was refused. */
export function stopOfRefusal(refusal: UsageRefusal, phase: "check" | "reserve"): PlanStop {
  switch (refusal.code) {
    case "plan.none":
      return noPlanStop();
    case "plan.inactive":
      return suspendedStop();
    case "plan.member.inactive":
      return memberRemovedStop();
    case "plan.concurrency":
      return concurrencyStop(refusal.running, refusal.limit, "scope");
    case "plan.member.concurrency":
      return concurrencyStop(refusal.running, refusal.limit, "member");
    case "usage.outbox-full":
      return usageStop(refusal.code, "Usage can't be counted right now, so nothing can run.", {});
    case "usage.rate":
    case "usage.member.rate":
      return usageStop(refusal.code, "Too many requests in a minute. Try again shortly.", {
        limit: String(refusal.limit),
        resetsAt: new Date(refusal.resetsAt).toISOString(),
      });
    default:
      return limitStop(refusal, phase);
  }
}

/** A unit's limit, for the pool (`plan.<unit>`) or for a member's share (`plan.member.<unit>`). */
function limitStop(
  refusal: Extract<UsageRefusal, { readonly unit: UsageUnit }>,
  phase: "check" | "reserve",
): PlanStop {
  const reached = {
    unit: refusal.unit === "harnessMs" ? "harnessMinutes" : refusal.unit,
    used: fromBase(refusal.unit, refusal.used),
    limit: fromBase(refusal.unit, refusal.limit),
    resetsAt: new Date(refusal.resetsAt).toISOString(),
    plan: refusal.plan ?? cloudPlan,
    ...(phase === "reserve"
      ? {
          reserve: {
            needed: fromBase(refusal.unit, refusal.needed),
            left: fromBase(refusal.unit, refusal.left),
          },
        }
      : {}),
  };
  if (refusal.code.startsWith("plan.member.")) return memberLimitStop(reached);
  return planLimitStop({ ...reached, canUpgrade: refusal.canUpgrade ?? false });
}

function fromBase(unit: keyof UsageAmounts, amount: number): number {
  if (unit === "cost") return amount / costBase;
  if (unit === "harnessMs") return amount / minuteBase;
  return amount;
}

/**
 * A `limit_reached` stop that isn't a plan's: the object's load limits. Its code doesn't start
 * with `plan.`, so a plan upgrade never lifts it.
 */
function usageStop(
  code: string,
  error: string,
  detail: Readonly<Record<string, string>>,
): PlanStop {
  return { error, cause: { kind: "limit_reached", code, detail } };
}
