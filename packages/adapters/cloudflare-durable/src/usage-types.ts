// The usage account's own small types. They stay this small on purpose: the Meter port's types
// arrive with the engine's Meter (HAL-16241), and the object that binds the two is a thin adapter.

/**
 * Where an account keeps its state: a Durable Object's synchronous storage (`ctx.storage.kv` and
 * `transactionSync`) in production, a map in tests.
 */
export interface UsageStorage {
  /** Runs `change` as one transaction: all its writes happen or none do, and nothing interleaves. */
  transactionSync<T>(change: () => T): T;
  get<T>(key: string): T | undefined;
  put<T>(key: string, value: T): void;
  delete(key: string): void;
  /** The entries whose keys start with `prefix`, in key order. */
  list<T>(prefix: string): Iterable<[string, T]>;
}

/**
 * The units an account counts. Every amount is a whole number in the unit's smallest step: cost
 * in millionths of the plan's currency, harness time in milliseconds. So no amount is ever a float.
 */
export const usageUnits = ["runs", "steps", "tokens", "cacheTokens", "cost", "harnessMs"] as const;

/** One of {@link usageUnits}. */
export type UsageUnit = (typeof usageUnits)[number];

/** Amounts per unit; a unit that isn't there is 0. */
export type UsageAmounts = Partial<Record<UsageUnit, number>>;

/** One organisation member as the limits document lists them. */
export interface MemberLimits {
  /** Only an active member may check, reserve or start a run. */
  readonly status: "active" | "removed";
  /** The member's share of the pool per unit, per period; a unit that isn't there has no share. */
  readonly shares?: UsageAmounts;
  /** How many runs the member may have running at once; no cap when it isn't there. */
  readonly maxRunning?: number;
}

/** The plan a limits document is for, so a stop can name it. */
export interface UsagePlan {
  /** The plan's machine id, such as `pro`. */
  readonly id: string;
  /** Goes up when the plan's terms change. */
  readonly version: number;
  /** What the customer calls the plan, such as `Pro`. */
  readonly name: string;
}

/** The limits Cloud sends for one scope. Only a newer version replaces the one an account has. */
export interface UsageLimits {
  /** Goes up with every document Cloud sends for this customer. */
  readonly version: number;
  /**
   * `active` while the subscription allows use (a trial included), `none` while the customer has
   * no plan at all; anything else refuses.
   */
  readonly status: "active" | "stopped" | "none";
  /** The subscription period, in ms since 1970; usage counts from `start`. */
  readonly period: { readonly start: number; readonly end: number };
  /** The pool's limit per unit, per period; a unit that isn't there has no limit. */
  readonly limits: UsageAmounts;
  /** What a step reserves for a limited unit it gives no maximum for. */
  readonly defaultReserve: UsageAmounts;
  /** How many runs the scope may have running at once. */
  readonly maxRunning: number;
  /** An organisation's members by actor id; a personal scope has none. */
  readonly members?: Readonly<Record<string, MemberLimits>>;
  /**
   * The plan these limits come from, taken from Cloud's `plan` when its state isn't `none`; a stop
   * and the account menu name it. Its name is text to show, never markup.
   */
  readonly plan?: UsagePlan;
  /** Amounts that take the place of the plan's limit of their unit, each until its `until`. */
  readonly overrides?: readonly UsageOverride[];
  /** The units whose limit the customer can raise by buying a bigger plan; none when not there. */
  readonly upgradable?: readonly UsageUnit[];
}

/**
 * An amount the seller set for one of the customer's units. It replaces the pool's limit of that
 * unit while `until` (ms since 1970) is in the future, or always when `until` is `null`, and only
 * when the plan limits that unit at all.
 */
export interface UsageOverride {
  readonly unit: UsageUnit;
  readonly amount: number;
  readonly until: number | null;
}

/** The longest plan name a limits document may carry. */
export const maxPlanNameLength = 200;

/**
 * What the account menu shows of a scope's usage: the plan's name and how much of its cost limit
 * this period's use took. Only what was spent counts, not what running steps still hold.
 */
export interface UsageSummary {
  /** The plan's name, or `null` when the account knows no limits or Cloud sent no plan. */
  readonly planName: string | null;
  /**
   * What was spent of the cost limit, as a whole percent rounded down and at most 100; `null`
   * when the account knows no cost limit.
   */
  readonly costPercent: number | null;
  /** When the kept limits' period ends, in ms since 1970; `null` when the account knows no limits. */
  readonly periodEnd: number | null;
}

/** Why an account refused, with what the app needs to word it. */
export type UsageRefusal =
  | { readonly code: "plan.none" }
  | { readonly code: "plan.inactive" }
  | { readonly code: "plan.member.inactive" }
  | {
      readonly code: "plan.concurrency" | "plan.member.concurrency";
      running: number;
      limit: number;
    }
  | {
      readonly code: `plan.${UsageUnit}` | `plan.member.${UsageUnit}`;
      readonly unit: UsageUnit;
      readonly used: number;
      readonly limit: number;
      readonly needed: number;
      readonly left: number;
      readonly resetsAt: number;
      /** The limits document's plan, when it has one. */
      readonly plan?: UsagePlan;
      /** Whether a bigger plan raises this limit; only for the pool's limits, never a member's. */
      readonly canUpgrade?: boolean;
    }
  | { readonly code: "usage.outbox-full" }
  | {
      readonly code: "usage.rate" | "usage.member.rate";
      readonly limit: number;
      readonly resetsAt: number;
    };

/** What a check, a reservation or a start answers. */
export type UsageAnswer =
  | { readonly allowed: true }
  | { readonly allowed: false; refusal: UsageRefusal };

/**
 * A record of use, as it goes to Cloud: ids, an enum, whole numbers and a time, nothing else. A
 * `correction` (id `<reservation>:late`) is the only kind whose units may be below 0: it takes a
 * step charged in full after its reservation ran out back to what it used.
 *
 * Cloud prices a model call from its own table by `model`, and charges a step at most its
 * `reservedMax`, never trusting the `cost` a record reports (requirement
 * `cloudflare-durable.usage-record-pricing`).
 */
export interface UsageRecord {
  readonly id: string;
  readonly scope: string;
  readonly actor: string;
  readonly runId: string;
  readonly kind: "model_call" | "step" | "run" | "correction";
  readonly units: UsageAmounts;
  /**
   * A `model_call`'s model as `<provider>/<model>`, such as `anthropic/claude-opus-5-5`. Absent on
   * other kinds, and on a call whose model isn't a machine id: Cloud holds such a call unpriced.
   */
  readonly model?: string;
  /** A `step`'s reservation: the most it may be charged per unit, defaults included. Absent on other kinds. */
  readonly reservedMax?: UsageAmounts;
  /** The period the use is billed in; a correction's is its step's, which may be the one before. */
  readonly periodStart: number;
  readonly at: number;
}

/** A row waiting to go to Cloud. Rows are only added here; sending them comes later. */
export type OutboxRow =
  | { readonly kind: "usage"; readonly record: UsageRecord }
  | {
      readonly kind: "threshold";
      readonly scope: string;
      readonly unit: UsageUnit;
      readonly percent: 80 | 100;
      readonly used: number;
      readonly limit: number;
      readonly periodStart: number;
      readonly at: number;
    }
  | {
      readonly kind: "outbox-full";
      readonly scope: string;
      readonly rows: number;
      readonly at: number;
    };
