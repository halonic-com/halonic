import { DurableObject } from "cloudflare:workers";
import type { SchedulerListener } from "@halonicjs/ports";
import { type Clock, systemClock } from "@halonicjs/std";
import { RoutinesState } from "./routines-state.ts";

/** The name of the one routines object of a deployment. */
export const defaultRoutinesObjectName = "routines";

/**
 * The Durable Object that owns the routine tick. The Worker's `scheduled()`
 * calls {@link RoutinesObject.tick} on every cron run; the object's alarm is
 * the backup that ticks when the cron has stopped. It does nothing itself:
 * both are {@link RoutinesState}.
 *
 * The Worker subclasses it and overrides {@link RoutinesObject.tickListener}:
 * the platform wakes the object at the alarm, and the object has no routine
 * scheduler of its own to call.
 *
 * Never rename or delete this class once it has been deployed: Cloudflare
 * deletes a Durable Object class's data with it. The names are fixed in
 * `durableObjectClassNames` and in the package README.
 */
export class RoutinesObject extends DurableObject {
  /** The time the backup alarm is set by. Only a test replaces it. */
  protected clock: Clock = systemClock;
  readonly #state: RoutinesState;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // Read through `this` on every call, so a subclass's clock and listener count.
    this.#state = new RoutinesState({
      alarm: {
        set: (atMs) => ctx.storage.setAlarm(atMs),
        clear: () => ctx.storage.deleteAlarm(),
      },
      clock: () => this.clock,
      listener: () => this.tickListener(),
      onBackupFailure: (error) => this.reportBackupFailure(error),
    });
  }

  /** Who is called at each tick. The Worker's subclass answers with its routine scheduler. */
  protected tickListener(): Pick<SchedulerListener, "onTick"> {
    throw new Error(
      "This RoutinesObject has no tick listener: subclass it and override tickListener().",
    );
  }

  /**
   * Where a failed backup tick goes. The default writes the error's name and message to the
   * Worker's log, never its stack or its cause, which may name things of a routine's run.
   */
  protected reportBackupFailure(error: unknown): void {
    const what = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`The routines backup tick failed. ${what}`);
  }

  /** The cron's tick for the ISO time `at`. */
  tick(at: string): Promise<void> {
    return this.#state.tick(at);
  }

  /** Cloudflare calls this when no tick has come for a few minutes. */
  override alarm(): Promise<void> {
    return this.#state.alarm();
  }
}
