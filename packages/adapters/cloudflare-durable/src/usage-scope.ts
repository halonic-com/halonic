import type { Clock } from "@halonicjs/ports";
import {
  type ReserveRequest,
  type SettleOutcome,
  UsageAccount,
  type UsageAccountOptions,
} from "./usage-account.ts";
import { checkScope } from "./usage-input.ts";
import { summaryOf, usageLimitsKey } from "./usage-limits.ts";
import { rememberNonce } from "./usage-nonces.ts";
import { takeRateSlot, type UsageRateLimits } from "./usage-rate.ts";
import { type KvStorageOwner, usageStorageOf } from "./usage-storage.ts";
import type {
  UsageAmounts,
  UsageAnswer,
  UsageLimits,
  UsageStorage,
  UsageSummary,
} from "./usage-types.ts";

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
   * Called when the object knows no limits, or only limits whose period has ended. The document
   * must already be verified as Cloud's: the object keeps whatever this returns.
   */
  readonly pullLimits: (scope: string) => Promise<UsageLimits | null>;
  /**
   * The name the Worker gave the object (`idFromName(scope)`), when it has one. A call for any
   * other scope is then refused even before the first call notes one. An object made from
   * `newUniqueId` or `idFromString` has no name, so only the noted scope is checked.
   */
  readonly objectName?: string | undefined;
  /**
   * Told of a pull that threw, which the step still sees as `plan.none`. Required, so the error a
   * refused step doesn't carry is always reported somewhere.
   */
  readonly onPullError: (error: unknown) => void;
  /** How long a pull that found no limits is remembered before the next one; 30 s by default. */
  readonly pullRetryMs?: number;
  /** The calls a scope and an organisation member may make per window, when not the defaults. */
  readonly rate?: UsageRateLimits;
  /** The account's outbox cap and run lease, when not its defaults. */
  readonly account?: Pick<UsageAccountOptions, "outboxCap" | "runLeaseMs">;
}

const scopeKey = "scope";

/** How long a pull that found no limits is remembered, so a scope with no plan can't flood Cloud. */
export const defaultPullRetryMs = 30_000;

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
  /** Until when a pull that found no limits stands; in memory only, so a restarted object asks again. */
  #noLimitsUntilMs = 0;

  constructor(options: UsageScopeOptions) {
    this.#options = options;
    this.#storage = usageStorageOf(options.storage);
  }

  /** Keeps a pushed limits document unless the object has that version or a newer one. */
  applyLimits(scope: string, limits: UsageLimits): "applied" | "stale" {
    return this.#account(scope).applyLimits(limits);
  }

  /**
   * Records the nonce of a signed request from Cloud to this scope, for the request's time window:
   * `"seen"` when the key already used it in that window. The signed path names the scope, so a
   * request replayed to another scope fails its signature, and one scope's nonces are enough.
   */
  rememberNonce(scope: string, keyId: string, nonce: string, keepUntilMs: number): "new" | "seen" {
    this.#account(scope);
    return rememberNonce(this.#storage, { keyId, nonce, keepUntilMs }, this.#nowMs());
  }

  /** Whether the principal may take a step now, or with `runStart` start a run (no slot is taken). */
  async check(
    principal: UsagePrincipal,
    options: { readonly runStart?: boolean } = {},
  ): Promise<UsageAnswer> {
    const account = this.#account(principal.scope);
    const limited = this.#takeRateSlot(principal);
    if (limited !== null) return limited;
    if (!(await this.#hasCurrentLimits(principal.scope))) return noLimits;
    return account.check(principal.actor, options);
  }

  /** Holds the step's maximum, or refuses; the alarm then settles it if it runs out. */
  async reserve(principal: UsagePrincipal, step: StepReservation): Promise<UsageAnswer> {
    const account = this.#account(principal.scope);
    const limited = this.#takeRateSlot(principal);
    if (limited !== null) return limited;
    if (!(await this.#hasCurrentLimits(principal.scope))) return noLimits;
    const answer = account.reserve({ ...step, actor: principal.actor });
    if (answer.allowed) await this.#arm(account);
    return answer;
  }

  /** Charges a step what it used; a late settle corrects a charge in full. */
  settle(scope: string, id: string, used: UsageAmounts): SettleOutcome {
    return this.#account(scope).settle(id, used);
  }

  /** Charges a model call, with its model, or a run's end once per id. */
  record(
    principal: UsagePrincipal,
    id: string,
    runId: string,
    kind: "model_call" | "run",
    used: UsageAmounts,
    model?: string,
  ): void {
    const owner = { runId, actor: principal.actor };
    this.#account(principal.scope).record(id, owner, kind, used, model);
  }

  /** Lets a run start or wake within the caps; the alarm frees its slot if it is lost. */
  async startRun(principal: UsagePrincipal, runId: string): Promise<UsageAnswer> {
    this.#account(principal.scope);
    const limited = this.#takeRateSlot(principal);
    if (limited !== null) return limited;
    return this.#holdRun(principal, runId);
  }

  /**
   * The running run's heartbeat, well inside its lease; a lost run is refused at a full cap. It
   * isn't rate limited: a refused heartbeat would stop a run that the limit let start.
   */
  async renewRun(principal: UsagePrincipal, runId: string): Promise<UsageAnswer> {
    return this.#holdRun(principal, runId);
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

  /**
   * How many rows wait to go to Cloud, for a delete of `scope` to check before it erases the
   * object. Unlike every other call it notes no scope, so a delete never starts an empty object.
   */
  unsentRows(scope: string): number {
    checkScope(scope);
    this.#checkName(scope);
    const noted = this.#storage.get<string>(scopeKey);
    if (noted === undefined) return 0;
    return this.#account(scope).outboxSize();
  }

  /**
   * The plan's name and the share of its cost limit spent this period, for the account menu. A
   * read: like {@link unsentRows} it notes no scope, it pulls nothing from Cloud and isn't rate
   * limited, so opening a menu never starts an empty object or asks Cloud.
   */
  summary(scope: string): UsageSummary {
    checkScope(scope);
    this.#checkName(scope);
    const noted = this.#storage.get<string>(scopeKey);
    if (noted === undefined) return summaryOf(undefined, {});
    return this.#account(scope).summary();
  }

  /**
   * Checks a call on a person's sealed secrets: only a person's scope (`u/`) keeps them, never an
   * organisation's, and only in that person's own object. A write notes the scope like any other
   * call; a read notes none, so listing names never starts an empty object.
   *
   * @throws RangeError when `scope` isn't a person's, or isn't this object's
   */
  checkSecretScope(scope: string, access: "read" | "write"): void {
    if (!checkScope(scope).startsWith("u/")) {
      throw new RangeError("Only a person's scope (u/) keeps secrets.");
    }
    if (access === "write") {
      this.#account(scope);
      return;
    }
    this.#checkName(scope);
    const noted = this.#storage.get<string>(scopeKey);
    if (noted !== undefined && noted !== scope) {
      throw new RangeError("This usage object counts another scope.");
    }
  }

  async #holdRun(principal: UsagePrincipal, runId: string): Promise<UsageAnswer> {
    const account = this.#account(principal.scope);
    if (!(await this.#hasCurrentLimits(principal.scope))) return noLimits;
    const answer = account.startRun(runId, principal.actor);
    if (answer.allowed) await this.#arm(account);
    return answer;
  }

  /** The rate refusal, or `null` once the call is counted; checked first, so a loop never pulls. */
  #takeRateSlot(principal: UsagePrincipal): UsageAnswer | null {
    const refusal = takeRateSlot(this.#storage, principal, this.#nowMs(), this.#options.rate);
    return refusal === null ? null : { allowed: false, refusal };
  }

  #checkName(scope: string): void {
    const { objectName } = this.#options;
    if (objectName !== undefined && objectName !== scope) {
      throw new RangeError("This usage object is named for another scope.");
    }
  }

  /** The account of `scope`, after noting it as this object's scope or checking it is. */
  #account(scope: string): UsageAccount {
    checkScope(scope);
    this.#checkName(scope);
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
    if (this.#nowMs() < this.#noLimitsUntilMs) return false;
    // Parallel calls share one pull, so a burst of steps asks Cloud once.
    this.#pulling ??= this.#pull(scope).finally(() => {
      this.#pulling = null;
    });
    await this.#pulling;
    return this.#currentLimits();
  }

  async #pull(scope: string): Promise<void> {
    const pulled = await this.#pullOrNull(scope);
    if (pulled !== null) this.#account(scope).applyLimits(pulled);
    if (!this.#currentLimits()) {
      this.#noLimitsUntilMs = this.#nowMs() + (this.#options.pullRetryMs ?? defaultPullRetryMs);
    }
  }

  /**
   * The pulled document, or `null` when the pull failed. A failed pull is Cloud being unreachable
   * for the step: it is refused with `plan.none`, the refusal a step gets with no limits, rather
   * than failing the run with the transport's error. The error itself always goes to
   * `onPullError`, so dropping it here never hides why Cloud couldn't be asked.
   */
  async #pullOrNull(scope: string): Promise<UsageLimits | null> {
    try {
      return await this.#options.pullLimits(scope);
    } catch (error) {
      this.#options.onPullError(error);
      return null;
    }
  }

  #currentLimits(): boolean {
    const limits = this.#storage.get<UsageLimits>(usageLimitsKey);
    // Only the end counts, not the start: the account starts a new period's spending when it is
    // given a document with a later start, so a document sent early for the next period applies.
    return limits !== undefined && this.#nowMs() < limits.period.end;
  }

  #nowMs(): number {
    return this.#options.clock().now().getTime();
  }

  async #arm(account: UsageAccount): Promise<void> {
    const expiry = account.settleExpired();
    const lease = account.freeLostRuns();
    const next = [expiry, lease].filter((at) => at !== null);
    if (next.length === 0) return this.#options.alarm.clear();
    await this.#options.alarm.set(Math.min(...next));
  }
}
