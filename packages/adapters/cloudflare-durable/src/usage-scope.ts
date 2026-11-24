import type { Clock } from "@halonicjs/ports";
import {
  type ReserveRequest,
  type SettleOutcome,
  UsageAccount,
  type UsageAccountOptions,
} from "./usage-account.ts";
import { checkScope } from "./usage-input.ts";
import { usageLimitsKey } from "./usage-limits.ts";
import { type KvStorageOwner, usageStorageOf } from "./usage-storage.ts";
import type { UsageAmounts, UsageAnswer, UsageLimits, UsageStorage } from "./usage-types.ts";

/** Who a call is for: the signed-in person and the scope their use counts in, from the host. */
export interface UsagePrincipal {
  readonly actor: string;
  readonly scope: string;
}

/** A step's reservation as the object takes it: the actor comes from the principal. */
export type StepReservation = Omit<ReserveRequest, "actor">;

/** What a {@link UsageScope} needs from its Durable Object. */
export interface UsageScopeOptions {
  readonly storage: KvStorageOwner;
  readonly alarm: { set(atMs: number): Promise<void>; clear(): Promise<void> };
  /** Read on every call, so a subclass's clock counts. */
  readonly clock: () => Clock;
  /**
   * Asks Cloud for the scope's limits: `null` when Cloud can't be reached, so the call is refused.
   * Called when the object knows no limits, or only limits whose period has ended.
   */
  readonly pullLimits: (scope: string) => Promise<UsageLimits | null>;
  /** The account's outbox cap and run lease, when not its defaults. */
  readonly account?: Pick<UsageAccountOptions, "outboxCap" | "runLeaseMs">;
}

const scopeKey = "scope";

/** The answer while the object knows no limits for the period it is in. */
const noLimits: UsageAnswer = { allowed: false, refusal: { code: "plan.none" } };

/**
 * One scope's usage, as its Durable Object runs it: a {@link UsageAccount} over the object's own
 * storage, one alarm for both of the account's sweeps, and limits pulled from Cloud when it has
 * none for the current period. The object is named from the principal's scope; the first call
 * notes that scope, and a call for any other is refused before anything is stored.
 */
export class UsageScope {
  readonly #options: UsageScopeOptions;
  readonly #storage: UsageStorage;
  #pulling: Promise<void> | null = null;

  constructor(options: UsageScopeOptions) {
    this.#options = options;
    this.#storage = usageStorageOf(options.storage);
  }

  /** Keeps a pushed limits document unless the object has that version or a newer one. */
  applyLimits(scope: string, limits: UsageLimits): "applied" | "stale" {
    return this.#account(scope).applyLimits(limits);
  }

  /** Whether the principal may take a step now. */
  async check(principal: UsagePrincipal): Promise<UsageAnswer> {
    const account = this.#account(principal.scope);
    if (!(await this.#hasCurrentLimits(principal.scope))) return noLimits;
    return account.check(principal.actor);
  }

  /** Holds the step's maximum, or refuses; the alarm then settles it if it runs out. */
  async reserve(principal: UsagePrincipal, step: StepReservation): Promise<UsageAnswer> {
    const account = this.#account(principal.scope);
    if (!(await this.#hasCurrentLimits(principal.scope))) return noLimits;
    const answer = account.reserve({ ...step, actor: principal.actor });
    if (answer.allowed) await this.#arm(account);
    return answer;
  }

  /** Charges a step what it used; a late settle corrects a charge in full. */
  settle(scope: string, id: string, used: UsageAmounts): SettleOutcome {
    return this.#account(scope).settle(id, used);
  }

  /** Charges a model call or a run's end once per id. */
  record(
    principal: UsagePrincipal,
    id: string,
    runId: string,
    kind: "model_call" | "run",
    used: UsageAmounts,
  ): void {
    this.#account(principal.scope).record(id, { runId, actor: principal.actor }, kind, used);
  }

  /** Lets a run start or wake within the caps; the alarm frees its slot if it is lost. */
  async startRun(principal: UsagePrincipal, runId: string): Promise<UsageAnswer> {
    const account = this.#account(principal.scope);
    if (!(await this.#hasCurrentLimits(principal.scope))) return noLimits;
    const answer = account.startRun(runId, principal.actor);
    if (answer.allowed) await this.#arm(account);
    return answer;
  }

  /** The running run's heartbeat, well inside its lease; a lost run is refused at a full cap. */
  async renewRun(principal: UsagePrincipal, runId: string): Promise<UsageAnswer> {
    return this.startRun(principal, runId);
  }

  /** Frees the run's slot, when it starts waiting or ends. */
  stopRunning(scope: string, runId: string): void {
    this.#account(scope).stopRunning(runId);
  }

  /** How many rows wait to go to Cloud. */
  outboxSize(scope: string): number {
    return this.#account(scope).outboxSize();
  }

  /** Charges what ran out, frees lost runs' slots, and sets the alarm for whichever is next. */
  async alarm(): Promise<void> {
    const scope = this.#storage.get<string>(scopeKey);
    if (scope === undefined) return this.#options.alarm.clear();
    await this.#arm(this.#account(scope));
  }

  /** The account of `scope`, after noting it as this object's scope or checking it is. */
  #account(scope: string): UsageAccount {
    checkScope(scope);
    this.#storage.transactionSync(() => {
      const noted = this.#storage.get<string>(scopeKey);
      if (noted === undefined) this.#storage.put(scopeKey, scope);
      else if (noted !== scope) throw new RangeError("This usage object counts another scope.");
    });
    const { clock, account } = this.#options;
    return new UsageAccount(this.#storage, { ...account, scope, clock: clock() });
  }

  /**
   * Whether the object has limits for the period it is in, after pulling them when it hasn't. A
   * document past its period's end counts as none: a stop Cloud sent and that was lost must not
   * leave the old period's quota in use.
   */
  async #hasCurrentLimits(scope: string): Promise<boolean> {
    if (this.#currentLimits()) return true;
    // Parallel calls share one pull, so a burst of steps asks Cloud once.
    this.#pulling ??= this.#pull(scope).finally(() => {
      this.#pulling = null;
    });
    await this.#pulling;
    return this.#currentLimits();
  }

  async #pull(scope: string): Promise<void> {
    const pulled = await this.#options.pullLimits(scope);
    if (pulled !== null) this.#account(scope).applyLimits(pulled);
  }

  #currentLimits(): boolean {
    const limits = this.#storage.get<UsageLimits>(usageLimitsKey);
    return limits !== undefined && this.#options.clock().now().getTime() < limits.period.end;
  }

  async #arm(account: UsageAccount): Promise<void> {
    const expiry = account.settleExpired();
    const lease = account.freeLostRuns();
    const next = [expiry, lease].filter((at) => at !== null);
    if (next.length === 0) return this.#options.alarm.clear();
    await this.#options.alarm.set(Math.min(...next));
  }
}
