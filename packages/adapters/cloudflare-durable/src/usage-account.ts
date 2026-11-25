import type { Clock } from "@halonicjs/ports";
import { checkAmount } from "./input-rules.ts";
import {
  defaultRunLeaseMs,
  freeExpiredSlots,
  type RunSlot,
  runKeyPrefix,
  slotRefusal,
} from "./run-slots.ts";
import { type Charged, ChargedIds, type FoundCharge, type Owner } from "./usage-charged.ts";
import {
  addAmounts,
  checkAmounts,
  checkId,
  checkIds,
  checkLimits,
  checkRecordKind,
  checkScope,
  correctionSuffix,
  modelOrNone,
} from "./usage-input.ts";
import {
  firstOver,
  newThresholds,
  summaryOf,
  usageLimitsKey,
  withDefaults,
} from "./usage-limits.ts";
import { defaultOutboxCap, UsageOutbox } from "./usage-outbox.ts";
import type {
  UsageAmounts,
  UsageAnswer,
  UsageLimits,
  UsageRecord,
  UsageRefusal,
  UsageStorage,
  UsageSummary,
} from "./usage-types.ts";

/** Use in the current period, for the pool and for each actor. */
interface Spent {
  periodStart: number;
  /** The period before this one, whose charged ids are still known. */
  previousStart: number;
  pool: UsageAmounts;
  actors: Record<string, UsageAmounts>;
  /** The thresholds already reported this period, as `<unit>:<percent>`. */
  reported: string[];
}

/** What Cloud prices a record by: a model call's model, or a step's reservation. */
type RecordPricing = Pick<UsageRecord, "model" | "reservedMax">;

/** Amounts held for a step until it settles or runs out. */
interface Reservation extends Owner {
  amounts: UsageAmounts;
  expiresAt: number;
}

const keys = {
  limits: usageLimitsKey,
  spent: "spent",
  reservation: "reservation:",
} as const;

/** How long past its step's time limit a reservation is held before it is charged in full. */
export const reservationMarginMs = 60_000;

/** What an account needs besides its storage. */
export interface UsageAccountOptions {
  /** The scope the account counts for: a person's or an organisation's. */
  readonly scope: string;
  readonly clock: Clock;
  readonly outboxCap?: number;
  /** How long a running run holds its slot without renewing it; {@link defaultRunLeaseMs} if unset. */
  readonly runLeaseMs?: number;
}

/** A step's reservation: its id, whose it is, its maximum use and its time limit. */
export interface ReserveRequest extends Owner {
  readonly id: string;
  readonly max: UsageAmounts;
  readonly timeLimitMs: number;
}

/** What `settle` did: a repeat or an id it never reserved changes nothing. */
export type SettleOutcome = "settled" | "corrected" | "already-settled" | "unknown";

/**
 * One scope's usage accounting: limits, reservations, running runs and the outbox to Cloud. Each
 * call checks and writes inside one synchronous storage transaction with no outside I/O, so
 * parallel calls can't both pass a limit. A Durable Object runs it, one per scope.
 */
export class UsageAccount {
  readonly #storage: UsageStorage;
  readonly #scope: string;
  readonly #clock: Clock;
  readonly #outbox: UsageOutbox;
  readonly #charged: ChargedIds;
  readonly #runLeaseMs: number;

  constructor(storage: UsageStorage, options: UsageAccountOptions) {
    this.#storage = storage;
    this.#scope = checkScope(options.scope);
    this.#clock = options.clock;
    this.#runLeaseMs = options.runLeaseMs ?? defaultRunLeaseMs;
    checkAmount("runLeaseMs", this.#runLeaseMs);
    this.#outbox = new UsageOutbox(storage, options.outboxCap ?? defaultOutboxCap);
    this.#charged = new ChargedIds(storage);
  }

  /**
   * Keeps `limits` unless the account already has that version or a newer one. A document for a
   * later period starts it: use counts from zero again. Nothing else starts a period.
   */
  applyLimits(limits: UsageLimits): "applied" | "stale" {
    checkLimits(limits);
    return this.#storage.transactionSync(() => {
      const current = this.#storage.get<UsageLimits>(keys.limits);
      if (current !== undefined && limits.version <= current.version) return "stale";
      this.#storage.put(keys.limits, limits);
      if (limits.period.start > this.#spent().periodStart) this.#startPeriod(limits.period.start);
      return "applied";
    });
  }

  /**
   * Whether `actor` may take a step now, or with `runStart` start a run: that also counts the
   * running runs against the caps, as {@link startRun} does, but takes no slot.
   */
  check(actor: string, options: { readonly runStart?: boolean } = {}): UsageAnswer {
    checkId("actor", actor);
    return this.#storage.transactionSync(() => {
      const refusal = this.#refusal(actor, {});
      if (refusal !== null || options.runStart !== true) return answer(refusal);
      return answer(slotRefusal(this.#storage, actor, this.#now()));
    });
  }

  /**
   * Holds the step's maximum, or refuses if spent plus reserved plus the maximum would pass a limit.
   * A limited unit the step gives no maximum for takes the limits' default.
   */
  reserve(request: ReserveRequest): UsageAnswer {
    const max = checkAmounts(request.max);
    checkIds(request);
    checkAmount("timeLimitMs", request.timeLimitMs);
    return this.#storage.transactionSync(() => {
      if (this.#storage.get(keys.reservation + request.id) !== undefined) return answer(null);
      if (this.#charged.find(request.id, this.#spent()) !== undefined) {
        throw new RangeError("This id was charged already.");
      }
      const amounts = withDefaults(max, this.#storage.get<UsageLimits>(keys.limits));
      const refusal = this.#refusal(request.actor, amounts);
      if (refusal !== null) return answer(refusal);
      const expiresAt = this.#now() + request.timeLimitMs + reservationMarginMs;
      const { runId, actor } = request;
      this.#storage.put<Reservation>(keys.reservation + request.id, {
        runId,
        actor,
        amounts,
        expiresAt,
      });
      return answer(null);
    });
  }

  /**
   * Charges a step what it used and releases the rest of its reservation. Once a reservation ran
   * out and was charged in full, a late settle corrects that charge to what was used.
   */
  settle(id: string, used: UsageAmounts): SettleOutcome {
    checkId("id", id);
    const amounts = checkAmounts(used);
    return this.#storage.transactionSync(() => {
      const reservation = this.#storage.get<Reservation>(keys.reservation + id);
      if (reservation !== undefined) {
        this.#storage.delete(keys.reservation + id);
        const { runId, actor } = reservation;
        const reservedMax = reservation.amounts;
        this.#charge(id, { runId, actor, amounts, by: "settle" }, "step", { reservedMax });
        return "settled";
      }
      const found = this.#charged.find(id, this.#spent());
      if (found === undefined) return "unknown";
      if (found.charged.by !== "expiry") return "already-settled";
      this.#correct(id, found, amounts);
      return "corrected";
    });
  }

  /**
   * Charges a model call or a run's end once per `id`; a repeat changes nothing. Records and
   * reservations share one set of ids, since Cloud keeps one record per id. A model call's record
   * names its `model`, for Cloud's price table; a run's names none.
   */
  record(
    id: string,
    owner: Owner,
    kind: "model_call" | "run",
    used: UsageAmounts,
    model?: string,
  ): void {
    checkIds({ id, ...owner });
    checkRecordKind(kind);
    const amounts = checkAmounts(used);
    const checkedModel = kind === "model_call" ? modelOrNone(model) : undefined;
    const pricing = checkedModel === undefined ? {} : { model: checkedModel };
    this.#storage.transactionSync(() => {
      if (this.#storage.get(keys.reservation + id) !== undefined) {
        throw new RangeError("This id belongs to a held reservation.");
      }
      if (this.#charged.find(id, this.#spent()) !== undefined) return;
      const charge: Charged = { runId: owner.runId, actor: owner.actor, amounts, by: "record" };
      this.#charge(id, charge, kind, pricing);
    });
  }

  /**
   * Charges every reservation that ran out its full maximum. Answers when the next one runs out,
   * for the object's alarm, or `null` when none is held.
   */
  settleExpired(): number | null {
    return this.#storage.transactionSync(() => {
      this.#charged.prune(this.#spent().previousStart);
      const now = this.#now();
      let next: number | null = null;
      for (const [key, reservation] of [...this.#storage.list<Reservation>(keys.reservation)]) {
        if (reservation.expiresAt > now) {
          next = Math.min(next ?? reservation.expiresAt, reservation.expiresAt);
          continue;
        }
        this.#storage.delete(key);
        const id = key.slice(keys.reservation.length);
        const { runId, actor, amounts } = reservation;
        const charge: Charged = { runId, actor, amounts, by: "expiry" };
        this.#charge(id, charge, "step", { reservedMax: amounts });
      }
      return next;
    });
  }

  /**
   * Lets a run start or wake, or refuses at the scope's or the member's cap. Only running runs
   * count: a run that waits calls {@link stopRunning} and holds no capacity. The slot is held for
   * the run's lease; a run that still holds one only renews it.
   */
  startRun(runId: string, actor: string): UsageAnswer {
    checkId("runId", runId);
    checkId("actor", actor);
    return this.#storage.transactionSync(() => {
      const now = this.#now();
      const slot = this.#storage.get<RunSlot>(runKeyPrefix + runId);
      const held = slot !== undefined && slot.expiresAt > now;
      if (!held) {
        const refusal = this.#refusal(actor, {}) ?? slotRefusal(this.#storage, actor, now);
        if (refusal !== null) return answer(refusal);
      }
      // A renewal keeps the slot's actor: the member it counts against doesn't change mid-run.
      const owner = held ? slot.actor : actor;
      const expiresAt = now + this.#runLeaseMs;
      this.#storage.put<RunSlot>(runKeyPrefix + runId, { actor: owner, expiresAt });
      return answer(null);
    });
  }

  /**
   * The running run's heartbeat: holds its slot for another lease. A run whose lease already ended
   * lost its slot, so it takes a new one only while the cap has room, and is refused otherwise.
   */
  renewRun(runId: string, actor: string): UsageAnswer {
    return this.startRun(runId, actor);
  }

  /**
   * Frees the slot of every run whose lease ended: a lost run's. Answers when the next lease ends,
   * for the object's alarm next to {@link settleExpired}, or `null` when no run holds a slot.
   */
  freeLostRuns(): number | null {
    return this.#storage.transactionSync(() => freeExpiredSlots(this.#storage, this.#now()));
  }

  /** Frees the run's slot, when it starts waiting or ends. */
  stopRunning(runId: string): void {
    checkId("runId", runId);
    this.#storage.transactionSync(() => this.#storage.delete(runKeyPrefix + runId));
  }

  /** How many rows wait to go to Cloud. */
  outboxSize(): number {
    return this.#outbox.size();
  }

  /**
   * The plan's name and the share of its cost limit spent this period; it changes nothing. Limits
   * whose period has ended count as none, as they do for a step: until Cloud sends the next period,
   * the old one's figures would read as this month's.
   */
  summary(): UsageSummary {
    return this.#storage.transactionSync(() => {
      const limits = this.#storage.get<UsageLimits>(keys.limits);
      const current = limits !== undefined && this.#now() < limits.period.end ? limits : undefined;
      return summaryOf(current, this.#spent().pool);
    });
  }

  #refusal(actor: string, needed: UsageAmounts): UsageRefusal | null {
    const limits = this.#storage.get<UsageLimits>(keys.limits);
    if (limits === undefined) return { code: "plan.none" };
    if (limits.status !== "active") return { code: "plan.inactive" };
    const member = limits.members?.[actor];
    if (limits.members !== undefined && member?.status !== "active") {
      return { code: "plan.member.inactive" };
    }
    if (this.#outbox.isFull()) return { code: "usage.outbox-full" };
    const taken = this.#taken();
    const resetsAt = limits.period.end;
    const { plan } = limits;
    const pool = firstOver("plan", limits.limits, taken.pool, needed, resetsAt, plan);
    if (pool !== null || member?.shares === undefined) return pool;
    const memberTaken = taken.actors[actor] ?? {};
    return firstOver("plan.member", member.shares, memberTaken, needed, resetsAt, plan);
  }

  /** Spent plus reserved, for the pool and per actor. */
  #taken(): Pick<Spent, "pool" | "actors"> {
    const spent = this.#spent();
    const taken = { pool: spent.pool, actors: { ...spent.actors } };
    for (const [, reservation] of this.#storage.list<Reservation>(keys.reservation)) {
      taken.pool = addAmounts(taken.pool, reservation.amounts);
      const actor = reservation.actor;
      taken.actors[actor] = addAmounts(taken.actors[actor] ?? {}, reservation.amounts);
    }
    return taken;
  }

  /** Counts `charge` in the current period, with its record in the outbox. */
  #charge(id: string, charge: Charged, kind: UsageRecord["kind"], pricing: RecordPricing): void {
    const spent = this.#spent();
    spent.pool = addAmounts(spent.pool, charge.amounts);
    spent.actors[charge.actor] = addAmounts(spent.actors[charge.actor] ?? {}, charge.amounts);
    this.#charged.put(spent.periodStart, id, charge);
    this.#addRecord(id, charge, kind, charge.amounts, spent.periodStart, pricing);
    this.#reportThresholds(spent);
    this.#storage.put(keys.spent, spent);
  }

  /**
   * Takes a charge in full back to what the step used. A charge from the period before is corrected
   * for that period: Cloud bills it there, and the current period's use stays as it is.
   */
  #correct(id: string, found: FoundCharge, used: UsageAmounts): void {
    const change = addAmounts(used, found.charged.amounts, -1);
    const charge: Charged = { ...found.charged, amounts: used, by: "settle" };
    this.#storage.put<Charged>(found.key, charge);
    // Cloud drops a record whose id it has, so a correction needs an id of its own.
    this.#addRecord(id + correctionSuffix, charge, "correction", change, found.periodStart, {});
    const spent = this.#spent();
    if (found.periodStart !== spent.periodStart) return;
    spent.pool = addAmounts(spent.pool, change);
    spent.actors[charge.actor] = addAmounts(spent.actors[charge.actor] ?? {}, change);
    this.#storage.put(keys.spent, spent);
  }

  #addRecord(
    id: string,
    owner: Owner,
    kind: UsageRecord["kind"],
    units: UsageAmounts,
    periodStart: number,
    pricing: RecordPricing,
  ): void {
    const { runId, actor } = owner;
    const at = this.#now();
    const record: UsageRecord = {
      id,
      scope: this.#scope,
      actor,
      runId,
      kind,
      units,
      ...pricing,
      periodStart,
      at,
    };
    this.#outbox.add({ kind: "usage", record });
  }

  /** Adds a row the first time this period the pool reaches 80% and 100% of a limit. */
  #reportThresholds(spent: Spent): void {
    const limits = this.#storage.get<UsageLimits>(keys.limits)?.limits ?? {};
    for (const { unit, percent, used, limit } of newThresholds(
      limits,
      spent.pool,
      spent.reported,
    )) {
      spent.reported.push(`${unit}:${percent}`);
      const { periodStart } = spent;
      const row = { scope: this.#scope, unit, percent, used, limit, periodStart, at: this.#now() };
      this.#outbox.add({ kind: "threshold", ...row });
    }
  }

  #spent(): Spent {
    return (
      this.#storage.get<Spent>(keys.spent) ?? {
        periodStart: 0,
        previousStart: 0,
        pool: {},
        actors: {},
        reported: [],
      }
    );
  }

  /** Use counts from zero again; the ids charged before the period that just ended are forgotten. */
  #startPeriod(periodStart: number): void {
    const previousStart = this.#spent().periodStart;
    const spent = { periodStart, previousStart, pool: {}, actors: {}, reported: [] };
    this.#storage.put<Spent>(keys.spent, spent);
    this.#charged.prune(previousStart);
  }

  #now(): number {
    return this.#clock.now().getTime();
  }
}

function answer(refusal: UsageRefusal | null): UsageAnswer {
  return refusal === null ? { allowed: true } : { allowed: false, refusal };
}
