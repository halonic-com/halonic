import type { SchedulerListener } from "@halonicjs/ports";
import type { Clock } from "@halonicjs/std";
import type { AlarmSlot } from "./run-state.ts";

/** The cron ticks every minute, so three quiet minutes mean the cron has stopped. */
export const defaultBackupAfterMs = 3 * 60 * 1000;

/** What a {@link RoutinesState} needs. Each is read at the time of use, so a test can change it. */
export interface RoutinesStateOptions {
  alarm: AlarmSlot;
  clock: () => Clock;
  listener: () => Pick<SchedulerListener, "onTick">;
  /** How long after a tick the backup alarm ticks by itself. Defaults to {@link defaultBackupAfterMs}. */
  backupAfterMs?: number;
}

/**
 * The one owner of the routine tick. The cron only wakes the routines object,
 * which passes each tick to the listener (the routine scheduler of
 * `@halonicjs/app`), one tick at a time. The scheduler keeps `lastTick` in
 * `Coordination` and gives each fire a fixed id, so a repeated or late tick
 * starts nothing twice; this class only makes sure no two ticks run at once.
 *
 * A tick that arrives while another is running shares that tick instead of
 * starting a second one. A tick that rejects is not retried: the next tick
 * catches up (the `Scheduler` port).
 *
 * After every tick the backup alarm is set a few minutes ahead. While the
 * cron runs, each tick moves it on and it never fires. If the cron stops, it
 * fires, ticks like the cron would, and sets itself again, so routines never
 * stop silently.
 */
export class RoutinesState {
  readonly #options: RoutinesStateOptions;
  #running: Promise<void> | null = null;

  constructor(options: RoutinesStateOptions) {
    this.#options = options;
  }

  /** Runs the tick for the ISO time `at`, or joins the tick already running. Rejects when the tick does. */
  tick(at: string): Promise<void> {
    this.#running ??= this.#run(at).finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  /**
   * The backup alarm: ticks at the clock's time. A failed tick is not thrown, because
   * Cloudflare would retry the alarm and a tick is never retried; the next one catches up.
   */
  async alarm(): Promise<void> {
    await this.tick(this.#options.clock().now().toISOString()).catch(() => undefined);
  }

  async #run(at: string): Promise<void> {
    try {
      await this.#options.listener().onTick(at);
    } finally {
      await this.#armBackup();
    }
  }

  async #armBackup(): Promise<void> {
    const afterMs = this.#options.backupAfterMs ?? defaultBackupAfterMs;
    await this.#options.alarm.set(this.#options.clock().now().getTime() + afterMs);
  }
}
