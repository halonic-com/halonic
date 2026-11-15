/** How long after the last change a workspace saves by itself (save model 1.1). */
const saveDelayMs = 1000;

/**
 * When the save was asked for. `typing-paused` is the scheduler's own pause; the rest are the
 * moments the Studio saves at once: the user left a field, switched tabs, closed the window or
 * pressed Ctrl S.
 */
export type SaveTrigger =
  | "typing-paused"
  | "field-left"
  | "tab-switched"
  | "window-closing"
  | "save-now";

/**
 * The clock the scheduler waits with. The Studio passes `setTimeout` and `clearTimeout`; a test
 * passes a clock it moves by hand, so no test sleeps.
 */
export interface SaveTimers {
  /** Calls `callback` once after `delayMs`; the result is what `clear` takes. */
  set(callback: () => void, delayMs: number): unknown;
  /** Stops a call that `set` made, if it hasn't happened yet. */
  clear(handle: unknown): void;
}

/** What {@link SaveScheduler} needs. */
export interface SaveSchedulerOptions {
  /** Writes what is unsaved, as `WorkspaceFiles.save` does; rejects when a write fails. */
  readonly save: (trigger: SaveTrigger) => Promise<unknown>;
  /** Whether anything is unsaved; a save of nothing is never asked for. */
  readonly isDirty: () => boolean;
  readonly timers: SaveTimers;
  /** Hears the failure of a save the pause started, as nobody awaits it. */
  readonly onError: (error: unknown) => void;
  /** How long to wait after the last change; one second unless a test says. */
  readonly delayMs?: number;
}

/**
 * Decides when a workspace saves (save model 1.1): about a second after typing stops, and at
 * once when the user leaves a field, switches tabs, closes the window or presses Ctrl S. It
 * holds only the timing. What to write, and how a failure shows, stay with `save` and the caller,
 * so Files, Workflows, Agents and the Assistant's Apply all save the same way.
 *
 * @example
 * const scheduler = new SaveScheduler({ save, isDirty, timers, onError });
 * scheduler.changed(); // after every edit
 * await scheduler.flush("field-left");
 */
export class SaveScheduler {
  private readonly options: SaveSchedulerOptions;
  private handle: unknown;
  private waiting = false;

  constructor(options: SaveSchedulerOptions) {
    this.options = options;
  }

  /** Something was edited: starts the pause again, so a run of typing is one save. */
  changed(): void {
    this.cancel();
    if (!this.options.isDirty()) {
      return;
    }
    this.waiting = true;
    this.handle = this.options.timers.set(() => {
      this.waiting = false;
      this.run("typing-paused").catch(this.options.onError);
    }, this.options.delayMs ?? saveDelayMs);
  }

  /** Whether a save is waiting for the pause to end. */
  get pending(): boolean {
    return this.waiting;
  }

  /**
   * Saves now, without the pause. Resolves to whether nothing is left unsaved afterwards, and
   * rejects with the save's own error when a write fails, so the caller can show it.
   */
  async flush(trigger: Exclude<SaveTrigger, "typing-paused">): Promise<boolean> {
    this.cancel();
    await this.run(trigger);
    return !this.options.isDirty();
  }

  /** Drops a save that was waiting. Call it once, when the workspace closes. */
  dispose(): void {
    this.cancel();
  }

  private async run(trigger: SaveTrigger): Promise<void> {
    if (this.options.isDirty()) {
      await this.options.save(trigger);
    }
  }

  private cancel(): void {
    if (this.waiting) {
      this.options.timers.clear(this.handle);
      this.waiting = false;
    }
  }
}
