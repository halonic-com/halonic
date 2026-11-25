// The Meter over a scope's `UsageObject` (requirement `runtime.usage-meter`): what the Worker
// gives the engine to count a top-level run's use against the scope's Cloud limits.
//
// One meter counts one top-level run. `Meter.reserve` names no run, and the object keeps each
// reservation and record under a run id, so the Worker makes a meter per top-level run, and a
// child run's steps and calls land under the top-level run, which spends from that run's budget.
//
// What is charged when (HAL-18024's plan, as approved):
// - `reserve` holds the step's maximum. A model call's cost, steps and tokens arrive through
//   `record` while the step runs, so `settle` charges the step only its harness time, with
//   explicit zeros for the rest: when a reservation ran out and was charged its full maximum, a
//   late settle corrects that charge to what it is given, and the zeros take back the cost that
//   the calls' records already counted.
// - A step whose settle never comes (its Worker died) is charged its full maximum when the
//   reservation runs out, on top of its calls' records. That overcharges, never undercharges.
// - A run's start and its slot stay with the Worker's run driving (`startRun`, `renewRun`), not
//   here: `check` records nothing, and a start it allowed may still fail before it runs.

import type {
  SettleOutcome,
  StepReservation,
  UsageAmounts,
  UsageAnswer,
  UsagePrincipal,
} from "@halonicjs/adapter-cloudflare-durable";
import type {
  Meter,
  MeterAnswer,
  MeterCheckKind,
  MeterMaximum,
  MeterPrincipal,
  MeterUsage,
  ModelCallUsage,
  Reservation,
  ReserveAnswer,
  StepTimes,
} from "@halonicjs/engine";
import type { IdGenerator } from "@halonicjs/ports";
import { stopOfRefusal, toBase } from "./usage-stops.ts";

/** The `UsageObject` methods the meter calls, as its RPC stub has them. */
export interface UsageObjectCalls {
  check(principal: UsagePrincipal, options: { readonly runStart?: boolean }): Promise<UsageAnswer>;
  reserve(principal: UsagePrincipal, step: StepReservation): Promise<UsageAnswer>;
  settle(scope: string, id: string, used: UsageAmounts): Promise<SettleOutcome>;
  record(
    principal: UsagePrincipal,
    id: string,
    runId: string,
    kind: "model_call" | "run",
    used: UsageAmounts,
    model?: string,
  ): Promise<void>;
  stopRunning(scope: string, runId: string): Promise<void>;
}

/** What a {@link UsageObjectMeter} needs. */
export interface UsageObjectMeterOptions {
  /** The scope's object, named `idFromName(scope)` by the Worker. */
  readonly objectOf: (scope: string) => UsageObjectCalls;
  /** The top-level run this meter counts; its child runs count under it. */
  readonly topRunId: string;
  readonly ids: IdGenerator;
}

/**
 * How long a step's reservation is held when the step gives no time maximum. The object holds back
 * its own default amount then; this is only when the reservation runs out and is charged in full,
 * which a late settle corrects.
 */
export const defaultStepTimeLimitMs = 60 * 60_000;

/** A `Meter` over the scope's `UsageObject`, for one top-level run. */
export class UsageObjectMeter implements Meter {
  readonly #options: UsageObjectMeterOptions;

  constructor(options: UsageObjectMeterOptions) {
    this.#options = options;
  }

  async check(
    principal: MeterPrincipal,
    request: { readonly kind: MeterCheckKind },
  ): Promise<MeterAnswer> {
    const object = this.#options.objectOf(principal.scope);
    const answer = await object.check(usagePrincipal(principal), {
      runStart: request.kind === "run-start",
    });
    if (answer.allowed) return { allowed: true };
    return { allowed: false, stop: stopOfRefusal(answer.refusal, "check") };
  }

  async reserve(principal: MeterPrincipal, maximum: MeterMaximum): Promise<ReserveAnswer> {
    const id = this.#options.ids.next("res_");
    const step: StepReservation = {
      id,
      runId: this.#options.topRunId,
      max: amountsOfMaximum(maximum),
      timeLimitMs:
        maximum.minutes === undefined
          ? defaultStepTimeLimitMs
          : toBase("harnessMs", maximum.minutes),
    };
    const object = this.#options.objectOf(principal.scope);
    const answer = await object.reserve(usagePrincipal(principal), step);
    if (!answer.allowed) return { allowed: false, stop: stopOfRefusal(answer.refusal, "reserve") };
    return { allowed: true, reservation: { id, principal } };
  }

  async settle(reservation: Reservation, times: StepTimes): Promise<void> {
    const { scope } = reservation.principal;
    // Explicit zeros, so a late settle takes back what the calls' records already counted.
    const used = {
      harnessMs: Math.round(times.harnessMs),
      cost: 0,
      steps: 0,
      tokens: 0,
      cacheTokens: 0,
      runs: 0,
    };
    await this.#options.objectOf(scope).settle(scope, reservation.id, used);
  }

  async record(principal: MeterPrincipal, usage: MeterUsage): Promise<void> {
    const object = this.#options.objectOf(principal.scope);
    const owner = usagePrincipal(principal);
    if (usage.kind === "run") {
      // A run's end is counted once per run, however often it is recorded.
      await object.record(owner, `${usage.runId}:end`, usage.runId, "run", { runs: 1 });
      await object.stopRunning(principal.scope, usage.runId);
      return;
    }
    if (usage.counted === "cached") return;
    const { topRunId } = this.#options;
    const used = amountsOfCall(usage);
    await object.record(owner, usage.callId, topRunId, "model_call", used, usage.model);
  }
}

function usagePrincipal(principal: MeterPrincipal): UsagePrincipal {
  return { actor: principal.actor, scope: principal.scope };
}

/** A step's maximum in the object's units; a unit it leaves out takes the object's default. */
function amountsOfMaximum(maximum: MeterMaximum): UsageAmounts {
  return {
    ...(maximum.cost === undefined ? {} : { cost: toBase("cost", maximum.cost) }),
    ...(maximum.minutes === undefined ? {} : { harnessMs: toBase("harnessMs", maximum.minutes) }),
    ...(maximum.steps === undefined ? {} : { steps: maximum.steps }),
  };
}

/** A model call as one step, its input and output tokens, its cache tokens and its cost. */
function amountsOfCall(call: ModelCallUsage): UsageAmounts {
  const usage = call.usage;
  const tokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
  const cacheTokens =
    (usage?.cacheReadTokens ?? 0) +
    (usage?.cacheWriteTokens ?? 0) +
    (usage?.cacheWrite1hTokens ?? 0);
  return { steps: 1, tokens, cacheTokens, cost: toBase("cost", call.cost) };
}
