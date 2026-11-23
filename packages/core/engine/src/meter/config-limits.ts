// Which of a deployment's `users.config` limits hold a principal (requirement
// `engine.config-meter`): the file's own limits in a personal scope; the
// organisation's pool, the member's share and both concurrency caps in an
// organisation's. A scope the file doesn't know refuses, and so does someone
// the organisation no longer lists: no limits known never means no limit.

import type { ConfigMeterSettings, UsageLimit } from "@halonicjs/format";
import type { MeterPrincipal, PlanStop } from "./meter.ts";
import { memberRemovedStop, noPlanStop } from "./plan-stops.ts";

/** The limits that hold one principal, or the stop that refuses them outright. */
export type PrincipalLimits =
  | { readonly refused: PlanStop }
  | {
      readonly refused?: undefined;
      /** The scope's limits, which all its members share. */
      readonly pool: readonly UsageLimit[];
      /** The member's share of the pool; none in a personal scope. */
      readonly share: readonly UsageLimit[];
      /** The most runs the scope may have going at once, when capped. */
      readonly scopeConcurrency?: number;
      /** The most runs the member may have going at once, when capped. */
      readonly memberConcurrency?: number;
    };

/** The limits of a principal the meter knows, who isn't refused outright. */
export type KnownLimits = Exclude<PrincipalLimits, { readonly refused: PlanStop }>;

/** The periods a meter counts over time; `run` and `step` limits belong to one run or step. */
export type CountedPeriod = "day" | "month";

/**
 * The limits that hold `principal`. Only `stop` limits count: a `notify`
 * limit refuses nothing.
 */
export function limitsOf(
  settings: ConfigMeterSettings,
  principal: MeterPrincipal,
): PrincipalLimits {
  if (principal.scope.startsWith("u/")) {
    return { pool: stopping(settings.limits), share: [] };
  }
  if (!principal.scope.startsWith("o/")) return { refused: noPlanStop() };
  const organisationId = principal.scope.slice("o/".length);
  const organisation = settings.organisations?.find((each) => each.id === organisationId);
  if (organisation === undefined) return { refused: noPlanStop() };
  const member = organisation.members.find((each) => each.actor === principal.actor);
  if (member === undefined) return { refused: memberRemovedStop() };
  return {
    pool: stopping(organisation.limits),
    share: stopping(member.limits ?? []),
    ...(organisation.concurrency === undefined
      ? {}
      : { scopeConcurrency: organisation.concurrency }),
    ...(member.concurrency === undefined ? {} : { memberConcurrency: member.concurrency }),
  };
}

/**
 * Refuses settings with a `stop` limit per `run` or per `step`. The meter is
 * asked by principal, not by run or step, so it couldn't keep to them, and a
 * limit it can't keep to must not read as kept. A harness step's own limits
 * (`harnessLimits`) and the run budget cover those today.
 *
 * @throws RangeError naming the first such limit
 */
export function assertCountable(settings: ConfigMeterSettings): void {
  const organisations = settings.organisations ?? [];
  const all = [
    ...settings.limits,
    ...organisations.flatMap((organisation) => [
      ...organisation.limits,
      ...organisation.members.flatMap((member) => member.limits ?? []),
    ]),
  ];
  const uncountable = stopping(all).find((limit) => !isCountedPeriod(limit.period));
  if (uncountable !== undefined) {
    throw new RangeError(
      `The users' limit on ${uncountable.unit} per ${uncountable.period} can't be kept by meter "config": use a limit per day or per month, or the agent's harnessLimits.`,
    );
  }
}

/** Whether a limit's period is one a meter counts over time. */
export function isCountedPeriod(period: UsageLimit["period"]): period is CountedPeriod {
  return period === "day" || period === "month";
}

function stopping(limits: readonly UsageLimit[]): readonly UsageLimit[] {
  return limits.filter((limit) => limit.action === "stop");
}
