// What the Meter suite gives a backend and takes back: one acme organisation, its people, and a
// plan in the Meter's own units. Each backend turns the plan into its own limits, so the cases read
// the same for every meter.
//
// The `Meter` port lives in the engine, which imports this package through its own dependencies,
// so the suite can't import it back. It describes the meter by its shape instead, and takes the
// usage only the engine makes from the harness (`Usage` and `Times` stay opaque to the cases).

import type { RunFailureCause, RunStatus } from "@halonicjs/events";
import type { ControlledClock } from "./clock.ts";

/** Who usage counts against, as `MeterPrincipal` has it. */
export interface MeterTestPrincipal {
  readonly actor: string;
  readonly scope: string;
  readonly role: "owner" | "admin" | "member";
}

/** A check's or a reservation's answer, as `MeterAnswer` and `ReserveAnswer` have it. */
export type MeterTestAnswer =
  | { readonly allowed: true; readonly reservation?: MeterTestReservation }
  | { readonly allowed: false; readonly stop: { readonly cause: RunFailureCause } };

/** What a step holds back, as `Reservation` has it. */
export interface MeterTestReservation {
  readonly id: string;
  readonly principal: MeterTestPrincipal;
}

/** The `Meter` port's shape, with the engine's usage and step times left opaque. */
export interface MeterUnderTest<Usage, Times> {
  check(
    principal: MeterTestPrincipal,
    request: { readonly kind: "run-start" | "model-call" | "harness-run" },
  ): Promise<MeterTestAnswer>;
  reserve(
    principal: MeterTestPrincipal,
    maximum: { readonly cost?: number; readonly minutes?: number; readonly steps?: number },
  ): Promise<MeterTestAnswer>;
  settle(reservation: MeterTestReservation, times: Times): Promise<void>;
  record(principal: MeterTestPrincipal, usage: Usage): Promise<void>;
}

/** The engine's makers of what a meter counts, which the harness passes in. */
export interface MeterUsageMakers<Usage, Times> {
  /** A model call of run `run_acme` that used 1,000 input and 200 output tokens and cost `cost`. */
  modelCall(cost: number, options?: { readonly cached?: boolean }): Usage;
  /** The end of run `runId`. */
  runEnd(runId: string, status: RunStatus): Usage;
  /** A step whose harness program ran for `harnessMs`. */
  stepTimes(harnessMs: number): Times;
}

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

/** What a backend's harness gives the suite. */
export interface MeterHarness<Usage, Times> {
  readonly meter: MeterUnderTest<Usage, Times>;
  readonly usage: MeterUsageMakers<Usage, Times>;
  /** Starts at {@link meterStart}. */
  readonly clock: ControlledClock;
  /** Counts a run as going, the way the backend's host does when a start was allowed. */
  startRun(principal: MeterTestPrincipal, runId: string): Promise<void>;
}

/** Creates a meter that holds the acme organisation to `plan`, with nothing used yet. */
export type MakeMeter<Usage, Times> = (plan: MeterPlan) => Promise<MeterHarness<Usage, Times>>;

/** The acme organisation's id. */
export const acmeOrganisationId = "org_acme0000000000001";

/** Where the clock starts: within November 2026, whose use resets at {@link meterResetsAt}. */
export const meterStart = new Date("2026-11-23T10:00:00.000Z");

/** When November's use starts again from 0. */
export const meterResetsAt = "2026-12-01T00:00:00.000Z";

function member(actor: string, role: MeterTestPrincipal["role"]): MeterTestPrincipal {
  return { actor, scope: `o/${acmeOrganisationId}`, role };
}

/** The organisation's owner, held only by the pool. */
export const ada = member("eu_ada00000000000001", "owner");
/** A member with a share of the pool, when the plan gives her one. */
export const bea = member("eu_bea00000000000001", "member");
/** Someone the organisation no longer lists. */
export const dan = member("eu_dan00000000000001", "member");

/** The people a harness lists as members: Ada and Bea, never Dan. */
export const acmeMembers: readonly MeterTestPrincipal[] = [ada, bea];

/** The run every {@link MeterUsageMakers.modelCall} belongs to. */
export const acmeRunId = "run_acme";

/** The refusal's code, or `undefined` when the answer allows. */
export function codeOf(answer: MeterTestAnswer): string | undefined {
  return answer.allowed ? undefined : answer.stop.cause.code;
}

/** The refusal's detail; empty when the answer allows. */
export function detailOf(answer: MeterTestAnswer): Readonly<Record<string, string>> {
  return answer.allowed ? {} : (answer.stop.cause.detail ?? {});
}
