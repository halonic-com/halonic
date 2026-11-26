import type { UsageSummary } from "@halonicjs/adapter-cloudflare-durable";
import { type AccountUsage, type Principal, scopeName } from "@halonicjs/host-server";
import type { RuntimeEnv } from "./env.ts";

/** The `UsageObject` method the account menu calls, as its RPC stub has it. */
export interface UsageSummaryCall {
  summary(scope: string): Promise<UsageSummary> | UsageSummary;
}

/**
 * The account menu's figures for the principal's scope, read from that scope's usage object.
 * A summary that throws makes this throw too, so `GET /api/account-menu` fails rather than
 * showing a wrong plan.
 */
export function accountUsageOf(
  objectOf: (scope: string) => UsageSummaryCall,
): (principal: Principal) => Promise<AccountUsage> {
  return async (principal) => {
    const scope = scopeName(principal.scope);
    const summary = await objectOf(scope).summary(scope);
    return { plan: summary.planName, usedPercent: summary.costPercent };
  };
}

/**
 * The `accountUsage` hook of `host/server`'s `ManyUserPorts` (requirement
 * `runtime.account-usage`): each principal's plan and used percent, from its scope's
 * `UsageObject`. A deployment without the `USAGE` binding keeps no usage, so it gets no hook and
 * the menu shows no plan and no percent.
 *
 * @example
 * const accountUsage = createAccountUsage(env);
 * const manyUsers = { verifier, cookieName, scopedRuns, ...(accountUsage && { accountUsage }) };
 */
export function createAccountUsage(
  env: RuntimeEnv,
): ((principal: Principal) => Promise<AccountUsage>) | undefined {
  const { USAGE } = env;
  if (USAGE === undefined) return undefined;
  return accountUsageOf((scope) => USAGE.get(USAGE.idFromName(scope)));
}
