import { DurableObject } from "cloudflare:workers";
import type { Clock } from "@halonicjs/ports";
import { systemClock } from "@halonicjs/std";
import type { SettleOutcome } from "./usage-account.ts";
import { type StepReservation, type UsagePrincipal, UsageScope } from "./usage-scope.ts";
import type { UsageAmounts, UsageAnswer, UsageLimits } from "./usage-types.ts";

/**
 * The Durable Object of one scope's usage: its limits, reservations, running runs and the outbox
 * to Cloud, in the object's own storage. The Worker names it from the principal's scope on the
 * server, never from a request field. It does nothing itself: each method is a method of
 * {@link UsageScope}.
 *
 * The Worker names it with `idFromName(scope)`, and the object refuses a call for any scope other
 * than its name. That check needs the name: an object made with `newUniqueId` or `idFromString`
 * has none, so only the scope its first call noted is checked. The Worker may subclass it and
 * override {@link UsageObject.pullLimits} to ask Cloud; until then an object that was pushed no limits refuses every step.
 *
 * Never rename or delete this class: Cloudflare deletes a Durable Object class's data with it.
 * Its name is in `durableObjectClassNames`, with a migration in the Worker's configuration.
 */
export class UsageObject extends DurableObject {
  /** The time reservations and leases run out by. Only a test replaces it. */
  protected clock: Clock = systemClock;
  readonly #scope: UsageScope;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // Read through `this` on every call, so a subclass's clock and pull count.
    this.#scope = new UsageScope({
      storage: ctx.storage,
      alarm: {
        set: (atMs) => ctx.storage.setAlarm(atMs),
        clear: () => ctx.storage.deleteAlarm(),
      },
      clock: () => this.clock,
      objectName: ctx.id.name,
      pullLimits: (scope) => this.pullLimits(scope),
      // The step is refused with `plan.none`; the log keeps why Cloud couldn't be asked.
      onPullError: (error) => console.error("The usage limits pull failed.", error),
    });
  }

  /**
   * Asks Cloud for the scope's limits; `null` when it can't be reached. None by default. An
   * override returns only a document it has verified as Cloud's (signed with Cloud's key): the
   * object keeps whatever this returns. A throw counts as `null` and is logged.
   */
  protected async pullLimits(_scope: string): Promise<UsageLimits | null> {
    return null;
  }

  /** Keeps a limits document the Worker verified as Cloud's, unless it is not newer. */
  applyLimits(scope: string, limits: UsageLimits): "applied" | "stale" {
    return this.#scope.applyLimits(scope, limits);
  }

  /** Records a verified Cloud request's nonce for its time window; `"seen"` for a repeat. */
  rememberNonce(scope: string, keyId: string, nonce: string, keepUntilMs: number): "new" | "seen" {
    return this.#scope.rememberNonce(scope, keyId, nonce, keepUntilMs);
  }

  check(principal: UsagePrincipal): Promise<UsageAnswer> {
    return this.#scope.check(principal);
  }

  reserve(principal: UsagePrincipal, step: StepReservation): Promise<UsageAnswer> {
    return this.#scope.reserve(principal, step);
  }

  settle(scope: string, id: string, used: UsageAmounts): SettleOutcome {
    return this.#scope.settle(scope, id, used);
  }

  record(
    principal: UsagePrincipal,
    id: string,
    runId: string,
    kind: "model_call" | "run",
    used: UsageAmounts,
  ): void {
    this.#scope.record(principal, id, runId, kind, used);
  }

  startRun(principal: UsagePrincipal, runId: string): Promise<UsageAnswer> {
    return this.#scope.startRun(principal, runId);
  }

  renewRun(principal: UsagePrincipal, runId: string): Promise<UsageAnswer> {
    return this.#scope.renewRun(principal, runId);
  }

  stopRunning(scope: string, runId: string): void {
    this.#scope.stopRunning(scope, runId);
  }

  outboxSize(scope: string): number {
    return this.#scope.outboxSize(scope);
  }

  /** Cloudflare calls this at the alarm time, and never twice at once. */
  override alarm(): Promise<void> {
    return this.#scope.alarm();
  }
}
