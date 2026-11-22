import type { Clock } from "@halonicjs/ports";
import { checkAmount } from "./input-rules.ts";
import { runKeyPrefix, slotRefusal } from "./run-slots.ts";
import {
  addAmounts,
  checkAmounts,
  checkId,
  checkIds,
  checkLimits,
  checkRecordKind,
  correctionSuffix,
} from "./usage-input.ts";
import { firstOver, newThresholds, usageLimitsKey, withDefaults } from "./usage-limits.ts";
import { defaultOutboxCap, UsageOutbox } from "./usage-outbox.ts";
import type {
  UsageAmounts,
  UsageAnswer,
  UsageLimits,
  UsageRecord,
  UsageRefusal,
  UsageStorage,
} from "./usage-types.ts";

/** Use in the current period, for the pool and for each actor. */
interface Spent {
  periodStart: number;
  pool: UsageAmounts;
  actors: Record<string, UsageAmounts>;
  /** The thresholds already reported this period, as `<unit>:<percent>`. */
  reported: string[];
}

/** Who a charge belongs to. */
interface Owner {
  runId: string;
  actor: string;
}

/** Amounts held for a step until it settles or runs out. */
interface Reservation extends Owner {
  amounts: UsageAmounts;
  expiresAt: number;
}

/** What a reservation or record id was charged, so a repeat changes nothing. */
interface Charged extends Owner {
  amounts: UsageAmounts;
  by: "settle" | "expiry" | "record";
}

const keys = {
  limits: usageLimitsKey,
  spent: "spent",
  reservation: "reservation:",
  charged: "charged:",
} as const;

/** How long past its step's time limit a reservation is held before it is charged in full. */
export const reservationMarginMs = 60_000;

/** What an account needs besides its storage. */
export interface UsageAccountOptions {
  /** The scope the account counts for: a person's or an organisation's. */
  readonly scope: string;
  readonly clock: Clock;
  readonly outboxCap?: number;
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

  constructor(storage: UsageStorage, options: UsageAccountOptions) {
    this.#storage = storage;
    this.#scope = checkId("scope", options.scope);
    this.#clock = options.clock;
    this.#outbox = new UsageOutbox(storage, options.outboxCap ?? defaultOutboxCap);
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

  /** Whether `actor` may take a step now. */
  check(actor: string): UsageAnswer {
    checkId("actor", actor);
    return this.#storage.transactionSync(() => answer(this.#refusal(actor, {})));
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
      if (this.#storage.get(keys.charged + request.id) !== undefined) {
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
        this.#charge(id, { runId, actor, amounts, by: "settle" }, "step");
        return "settled";
      }
      const charged = this.#storage.get<Charged>(keys.charged + id);
      if (charged === undefined) return "unknown";
      if (charged.by !== "expiry") return "already-settled";
      const correction = addAmounts(amounts, charged.amounts, -1);
      this.#charge(id, { ...charged, amounts, by: "settle" }, "correction", correction);
      return "corrected";
    });
  }

  /**
   * Charges a model call or a run's end once per `id`; a repeat changes nothing. Records and
   * reservations share one set of ids, since Cloud keeps one record per id.
   */
  record(id: string, owner: Owner, kind: "model_call" | "run", used: UsageAmounts): void {
    checkIds({ id, ...owner });
    checkRecordKind(kind);
    const amounts = checkAmounts(used);
    this.#storage.transactionSync(() => {
      if (this.#storage.get(keys.reservation + id) !== undefined) {
        throw new RangeError("This id belongs to a held reservation.");
      }
      if (this.#storage.get(keys.charged + id) !== undefined) return;
      this.#charge(id, { runId: owner.runId, actor: owner.actor, amounts, by: "record" }, kind);
    });
  }

  /**
   * Charges every reservation that ran out its full maximum. Answers when the next one runs out,
   * for the object's alarm, or `null` when none is held.
   */
  settleExpired(): number | null {
    return this.#storage.transactionSync(() => {
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
        this.#charge(id, { runId, actor, amounts, by: "expiry" }, "step");
      }
      return next;
    });
  }

  /**
   * Lets a run start or wake, or refuses at the scope's or the member's cap. Only running runs
   * count: a run that waits calls {@link stopRunning} and holds no capacity.
   */
  startRun(runId: string, actor: string): UsageAnswer {
    checkId("runId", runId);
    checkId("actor", actor);
    return this.#storage.transactionSync(() => {
      if (this.#storage.get(runKeyPrefix + runId) !== undefined) return answer(null);
      const refusal = this.#refusal(actor, {}) ?? slotRefusal(this.#storage, actor);
      if (refusal !== null) return answer(refusal);
      this.#storage.put(runKeyPrefix + runId, { actor });
      return answer(null);
    });
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
    const pool = firstOver("plan", limits.limits, taken.pool, needed, resetsAt);
    if (pool !== null || member?.shares === undefined) return pool;
    return firstOver("plan.member", member.shares, taken.actors[actor] ?? {}, needed, resetsAt);
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

  /** Counts `charge` (or `change`, a correction's difference), with its record in the outbox. */
  #charge(id: string, charge: Charged, kind: UsageRecord["kind"], change = charge.amounts): void {
    const spent = this.#spent();
    spent.pool = addAmounts(spent.pool, change);
    spent.actors[charge.actor] = addAmounts(spent.actors[charge.actor] ?? {}, change);
    this.#storage.put<Charged>(keys.charged + id, charge);
    const { runId, actor } = charge;
    // Cloud drops a record whose id it has, so a correction needs an id of its own.
    const recordId = kind === "correction" ? id + correctionSuffix : id;
    const at = this.#now();
    const record = { id: recordId, scope: this.#scope, actor, runId, kind, units: change, at };
    this.#outbox.add({ kind: "usage", record });
    this.#reportThresholds(spent);
    this.#storage.put(keys.spent, spent);
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
      this.#storage.get<Spent>(keys.spent) ?? { periodStart: 0, pool: {}, actors: {}, reported: [] }
    );
  }

  /** Use counts from zero again; the ids charged last period are forgotten. */
  #startPeriod(periodStart: number): void {
    this.#storage.put<Spent>(keys.spent, { periodStart, pool: {}, actors: {}, reported: [] });
    for (const [key] of [...this.#storage.list(keys.charged)]) this.#storage.delete(key);
  }

  #now(): number {
    return this.#clock.now().getTime();
  }
}

function answer(refusal: UsageRefusal | null): UsageAnswer {
  return refusal === null ? { allowed: true } : { allowed: false, refusal };
}
