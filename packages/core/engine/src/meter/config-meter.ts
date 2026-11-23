// The meter of a deployment whose `users` block says `meter: config`
// (requirement `engine.config-meter`): it holds each person to the limits
// written in the file, and each organisation to its pool, its members'
// shares and its concurrency caps, so a self-hoster can cap a team without
// Halonic Cloud. Its counts live in `Coordination`, never in this object.

import type { ConfigMeterSettings, UsageLimit } from "@halonicjs/format";
import type { Clock, Coordination, IdGenerator } from "@halonicjs/ports";
import { assertCountable, isCountedPeriod, type KnownLimits, limitsOf } from "./config-limits.ts";
import type {
  Meter,
  MeterAnswer,
  MeterCheckKind,
  MeterMaximum,
  MeterPrincipal,
  MeterUsage,
  PlanStop,
  Reservation,
  ReserveAnswer,
  StepTimes,
} from "./meter.ts";
import { concurrencyStop, memberLimitStop, planLimitStop, type StopPlan } from "./plan-stops.ts";
import {
  assertLedgerFits,
  fromBase,
  type Holder,
  heldOf,
  type Ledger,
  LedgerStore,
  type MeteredUnit,
  resetsAtOf,
  type ShareHolder,
  toBase,
  type UnitAmounts,
  usedOf,
  withoutPast,
  withUse,
} from "./usage-ledger.ts";

/**
 * How many runs are going, as the host that starts them knows.
 *
 * The meter only reads this count and holds nothing, so two runs started at
 * the same moment can both pass a cap with one place left. A host that must
 * keep to the cap exactly makes checking and starting a run one atomic step;
 * otherwise a cap can be passed by the runs started together.
 */
export interface RunningRuns {
  /** The runs going in `scope`, and how many of them `actor` started. */
  count(scope: string, actor: string): Promise<{ readonly scope: number; readonly actor: number }>;
}

/** What a `ConfigMeter` needs. */
export interface ConfigMeterOptions {
  /** The deployment's `users.config`. */
  readonly settings: ConfigMeterSettings;
  /** Where the counts are kept, shared by every instance of the deployment. */
  readonly coordination: Pick<Coordination, "read" | "compareAndSet">;
  readonly clock: Clock;
  /** Makes the ids of what steps hold back. */
  readonly ids: IdGenerator;
  readonly running: RunningRuns;
}

/**
 * What a unit's limit is asked: `undefined` to leave it out, `null` whether
 * anything is left, a number whether that much is left.
 */
type Need = (unit: MeteredUnit) => number | null | undefined;

/** The plan a stop names: the file's limits, which no one can upgrade from the app. */
const configPlan: StopPlan = { id: "config", version: 1, name: "config" };

/** A meter that holds each principal to the limits in a deployment's `users.config`. */
export class ConfigMeter implements Meter {
  readonly #settings: ConfigMeterSettings;
  readonly #ledgers: LedgerStore;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #running: RunningRuns;

  /**
   * @throws RangeError when a limit is per run or per step, which this meter
   * can't keep to, or when an organisation gives so many members a share that
   * their counts couldn't be stored
   */
  constructor(options: ConfigMeterOptions) {
    assertCountable(options.settings);
    for (const organisation of options.settings.organisations ?? []) {
      const holders = organisation.members.map((member) => ({
        actor: member.actor,
        share: member.limits ?? [],
      }));
      assertLedgerFits(`o/${organisation.id}`, holders);
    }
    this.#settings = options.settings;
    this.#ledgers = new LedgerStore(options.coordination);
    this.#clock = options.clock;
    this.#ids = options.ids;
    this.#running = options.running;
  }

  /** Refuses at a cap on runs at once (for a run start) or at a limit that is used up. */
  async check(
    principal: MeterPrincipal,
    request: { readonly kind: MeterCheckKind },
  ): Promise<MeterAnswer> {
    const limits = limitsOf(this.#settings, principal);
    if (limits.refused !== undefined) return { allowed: false, stop: limits.refused };
    const starting = request.kind === "run-start";
    const capped = starting ? await this.#concurrencyStop(principal, limits) : null;
    if (capped !== null) return { allowed: false, stop: capped };
    const now = this.#clock.now();
    const ledger = withoutPast(await this.#ledgers.read(principal.scope), now);
    // Runs count only against starting one: a run going on may finish.
    const need: Need = (unit) => (unit === "runs" && !starting ? undefined : null);
    const stop = reachedStop(ledger, principal, limits, now, need);
    return stop === null ? { allowed: true } : { allowed: false, stop };
  }

  /** Holds back the step's maximum, or refuses when a limit hasn't that much left. */
  async reserve(principal: MeterPrincipal, maximum: MeterMaximum): Promise<ReserveAnswer> {
    const limits = limitsOf(this.#settings, principal);
    if (limits.refused !== undefined) return { allowed: false, stop: limits.refused };
    const amounts = baseOfMaximum(maximum);
    const now = this.#clock.now();
    const id = this.#ids.next("hold_");
    // A unit the step sets no maximum for holds back nothing, but is refused once used up.
    const need: Need = (unit) => (unit === "runs" ? undefined : (amounts[unit] ?? null));
    return this.#ledgers.change<ReserveAnswer>(principal.scope, (stored) => {
      const ledger = withoutPast(stored, now);
      const stop = reachedStop(ledger, principal, limits, now, need);
      if (stop !== null) return { next: null, answer: { allowed: false, stop } };
      const held = { actor: principal.actor, at: now.getTime(), amounts };
      return {
        next: { ...ledger, held: { ...ledger.held, [id]: held } },
        answer: { allowed: true, reservation: { id, principal } },
      };
    });
  }

  /** Lets go of what the step held back, and counts its harness time. */
  async settle(reservation: Reservation, times: StepTimes): Promise<void> {
    const { principal } = reservation;
    const member = this.#shareHolderOf(principal);
    const now = this.#clock.now();
    await this.#ledgers.change(principal.scope, (stored) => {
      const ledger = withoutPast(stored, now);
      const held = Object.fromEntries(
        Object.entries(ledger.held).filter(([id]) => id !== reservation.id),
      );
      const next = withUse({ ...ledger, held }, member, { harnessMinutes: times.harnessMs }, now);
      return { next, answer: undefined };
    });
  }

  /** Counts a model call's step, tokens and cost, or a run's end. An answer from the cache counts nothing. */
  async record(principal: MeterPrincipal, usage: MeterUsage): Promise<void> {
    const amounts = amountsOf(usage);
    if (amounts === null) return;
    const member = this.#shareHolderOf(principal);
    const now = this.#clock.now();
    await this.#ledgers.change(principal.scope, (stored) => ({
      next: withUse(withoutPast(stored, now), member, amounts, now),
      answer: undefined,
    }));
  }

  /**
   * The member whose own use is counted, or `null` when only the pool counts
   * it: a personal scope, a member without a share, or someone the file no
   * longer lists, whose use still counts against the pool.
   */
  #shareHolderOf(principal: MeterPrincipal): ShareHolder | null {
    const limits = limitsOf(this.#settings, principal);
    if (limits.refused !== undefined || limits.share.length === 0) return null;
    return { actor: principal.actor, share: limits.share };
  }

  async #concurrencyStop(principal: MeterPrincipal, limits: KnownLimits): Promise<PlanStop | null> {
    const { memberConcurrency, scopeConcurrency } = limits;
    if (memberConcurrency === undefined && scopeConcurrency === undefined) return null;
    const running = await this.#running.count(principal.scope, principal.actor);
    if (memberConcurrency !== undefined && running.actor >= memberConcurrency) {
      return concurrencyStop(running.actor, memberConcurrency, "member");
    }
    if (scopeConcurrency !== undefined && running.scope >= scopeConcurrency) {
      return concurrencyStop(running.scope, scopeConcurrency, "scope");
    }
    return null;
  }
}

/** The first limit reached, inner to outer: the member's share, then the scope's pool. */
function reachedStop(
  ledger: Ledger,
  principal: MeterPrincipal,
  limits: KnownLimits,
  now: Date,
  need: Need,
): PlanStop | null {
  const member: Holder = { actor: principal.actor };
  for (const limit of limits.share) {
    const reached = reachedLimit(ledger, member, limit, now, need(limit.unit));
    if (reached !== null) return memberLimitStop(reached);
  }
  for (const limit of limits.pool) {
    const reached = reachedLimit(ledger, { pool: true }, limit, now, need(limit.unit));
    if (reached !== null) return planLimitStop({ ...reached, canUpgrade: false });
  }
  return null;
}

/** The limit as a stop names it when `needed` doesn't fit in what is left of it; `null` while it fits. */
function reachedLimit(
  ledger: Ledger,
  holder: Holder,
  limit: UsageLimit,
  now: Date,
  needed: number | null | undefined,
) {
  if (needed === undefined || !isCountedPeriod(limit.period)) return null;
  const unit = limit.unit;
  const used = usedOf(ledger, holder, unit, limit.period, now) + heldOf(ledger, holder, unit);
  const left = Math.max(0, toBase(unit, limit.amount) - used);
  const fits = needed === null ? left > 0 : needed <= left;
  if (fits) return null;
  return {
    unit,
    used: fromBase(unit, used),
    limit: limit.amount,
    resetsAt: resetsAtOf(limit.period, now),
    plan: configPlan,
    ...(needed === null
      ? {}
      : { reserve: { needed: fromBase(unit, needed), left: fromBase(unit, left) } }),
  };
}

/** A step's maximum in each unit's base; a unit it leaves out is absent. */
function baseOfMaximum(maximum: MeterMaximum): UnitAmounts {
  return {
    ...(maximum.cost === undefined ? {} : { cost: toBase("cost", maximum.cost) }),
    ...(maximum.minutes === undefined
      ? {}
      : { harnessMinutes: toBase("harnessMinutes", maximum.minutes) }),
    ...(maximum.steps === undefined ? {} : { steps: maximum.steps }),
  };
}

/** What a recorded usage adds, in each unit's base; `null` for an answer from the cache. */
function amountsOf(usage: MeterUsage): UnitAmounts | null {
  if (usage.kind === "run") return { runs: 1 };
  if (usage.counted === "cached") return null;
  const tokens = (usage.usage?.inputTokens ?? 0) + (usage.usage?.outputTokens ?? 0);
  return { steps: 1, tokens, cost: toBase("cost", usage.cost) };
}
