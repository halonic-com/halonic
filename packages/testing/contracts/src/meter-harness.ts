// What the Meter suite gives a backend and takes back: one acme organisation, its people, a plan in
// the Meter's own units, and the usage only the engine makes. Each backend turns the plan into its
// own limits, so the cases read the same for every meter.

import {
  type LoggedModelResponse,
  type Meter,
  type MeterAnswer,
  type MeterPrincipal,
  type ModelCallUsage,
  modelCallUsageOf,
  type ReserveAnswer,
  type RunEndUsage,
  runEndUsageOf,
  type StepTimes,
} from "@halonicjs/engine";
import type { RunStatus } from "@halonicjs/events";
import type { ControlledClock } from "./clock.ts";

/** Amounts in the Meter's units: cost in the budget's currency, harness time in minutes. */
export interface MeterPlanAmounts {
  readonly runs?: number;
  readonly steps?: number;
  readonly tokens?: number;
  readonly cost?: number;
  readonly harnessMinutes?: number;
}

/**
 * The limits a case needs, per calendar month (UTC). A unit that isn't there has no limit. Ada and
 * Bea are the organisation's members; Dan was one and isn't any more.
 */
export interface MeterPlan {
  /** What the organisation's members together may use. */
  readonly pool: MeterPlanAmounts;
  /** Bea's share of the pool; Ada has none, so only the pool holds her. */
  readonly beaShare?: MeterPlanAmounts;
  /** How many runs the organisation may have going at once; no cap when it isn't there. */
  readonly concurrency?: number;
}

/** What a backend's harness gives the suite: the meter, the clock it reads, and a way to start a run. */
export interface MeterHarness {
  readonly meter: Meter;
  /** Starts at {@link meterStart}. */
  readonly clock: ControlledClock;
  /** Counts a run as going, the way the backend's host does when a start was allowed. */
  startRun(principal: MeterPrincipal, runId: string): Promise<void>;
}

/** Creates a meter that holds the acme organisation to `plan`, with nothing used yet. */
export type MakeMeter = (plan: MeterPlan) => Promise<MeterHarness>;

/** The acme organisation's id. */
export const acmeOrganisationId = "org_acme0000000000001";

/** Where the clock starts: within November 2026, whose use resets at {@link meterResetsAt}. */
export const meterStart = new Date("2026-11-23T10:00:00.000Z");

/** When November's use starts again from 0. */
export const meterResetsAt = "2026-12-01T00:00:00.000Z";

function member(actor: string, role: MeterPrincipal["role"]): MeterPrincipal {
  return { actor, scope: `o/${acmeOrganisationId}`, role };
}

/** The organisation's owner, held only by the pool. */
export const ada = member("eu_ada00000000000001", "owner");
/** A member with a share of the pool, when the plan gives her one. */
export const bea = member("eu_bea00000000000001", "member");
/** Someone the organisation no longer lists. */
export const dan = member("eu_dan00000000000001", "member");

/** The people a harness lists as members: Ada and Bea, never Dan. */
export const acmeMembers: readonly MeterPrincipal[] = [ada, bea];

/** A model call of run `run_acme` that used 1,000 input and 200 output tokens and cost `cost`. */
export function modelCall(cost: number, fields: Partial<LoggedModelResponse> = {}): ModelCallUsage {
  return modelCallUsageOf({
    type: "llm.response",
    agent: "writer",
    provider: "acme-ai",
    model: "acme-1",
    usage: { inputTokens: 1000, outputTokens: 200 },
    latencyMs: 5,
    text: "",
    runId: "run_acme",
    seq: 2,
    at: meterStart.toISOString(),
    cost,
    ...fields,
  });
}

/** The end of run `runId`. */
export function runEnd(runId: string, status: RunStatus = "completed"): RunEndUsage {
  // Only the run's id and status are read.
  return runEndUsageOf({ runId, status } as Parameters<typeof runEndUsageOf>[0]);
}

/** A step whose harness program ran for `harnessMs`. */
export function stepTimes(harnessMs: number): StepTimes {
  // The engine makes these from its clock; the suite only needs the amounts.
  return { wallMs: harnessMs, harnessMs } as StepTimes;
}

/** The refusal's code, or `undefined` when the answer allows. */
export function codeOf(answer: MeterAnswer | ReserveAnswer): string | undefined {
  return answer.allowed ? undefined : answer.stop.cause.code;
}

/** The refusal's detail; empty when the answer allows. */
export function detailOf(answer: MeterAnswer | ReserveAnswer): Readonly<Record<string, string>> {
  return answer.allowed ? {} : (answer.stop.cause.detail ?? {});
}
