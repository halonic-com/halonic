import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { SaveScheduler, type SaveTimers, type SaveTrigger } from "./save-scheduler.ts";

/** A clock that moves only when the test says. */
class HandClock implements SaveTimers {
  private now = 0;
  private next = 0;
  private readonly due = new Map<number, { at: number; callback: () => void }>();

  set(callback: () => void, delayMs: number): number {
    this.next += 1;
    this.due.set(this.next, { at: this.now + delayMs, callback });
    return this.next;
  }

  clear(handle: unknown): void {
    this.due.delete(handle as number);
  }

  advance(ms: number): void {
    this.now += ms;
    for (const [handle, timer] of [...this.due]) {
      if (timer.at <= this.now) {
        this.due.delete(handle);
        timer.callback();
      }
    }
  }
}

function setup(options: { failWith?: Error } = {}) {
  const clock = new HandClock();
  const saved: SaveTrigger[] = [];
  const errors: unknown[] = [];
  const state = { dirty: false };
  const scheduler = new SaveScheduler({
    timers: clock,
    isDirty: () => state.dirty,
    onError: (error) => errors.push(error),
    save: async (trigger) => {
      saved.push(trigger);
      if (options.failWith !== undefined) {
        throw options.failWith;
      }
      state.dirty = false;
    },
  });
  const edit = () => {
    state.dirty = true;
    scheduler.changed();
  };
  return { clock, saved, errors, state, scheduler, edit };
}

verifies("app.save-scheduler", () => {
  describe("the pause", () => {
    it("saves once, 1 second after the last change", () => {
      const { clock, saved, edit } = setup();
      edit();
      clock.advance(600);
      edit();
      clock.advance(999);
      expect(saved).toEqual([]);
      clock.advance(1);
      expect(saved).toEqual(["typing-paused"]);
    });

    it("asks for nothing when nothing is unsaved", () => {
      const { clock, saved, scheduler } = setup();
      scheduler.changed();
      clock.advance(5000);
      expect(saved).toEqual([]);
      expect(scheduler.pending).toBe(false);
    });

    it("reports the failure of a save nobody awaits", async () => {
      const failure = new Error("disk full");
      const { clock, errors, edit } = setup({ failWith: failure });
      edit();
      clock.advance(1000);
      await expect.poll(() => errors).toEqual([failure]);
    });
  });

  describe("saving at once", () => {
    it.each(["field-left", "tab-switched", "window-closing", "save-now"] as const)(
      "saves on %s and ends the pause",
      async (trigger) => {
        const { clock, saved, scheduler, edit } = setup();
        edit();
        expect(await scheduler.flush(trigger)).toBe(true);
        clock.advance(5000);
        expect(saved).toEqual([trigger]);
      },
    );

    it("writes nothing when nothing is unsaved", async () => {
      const { saved, scheduler } = setup();
      expect(await scheduler.flush("save-now")).toBe(true);
      expect(saved).toEqual([]);
    });

    it("gives the caller the save's error", async () => {
      const failure = new Error("not writable");
      const { scheduler, edit } = setup({ failWith: failure });
      edit();
      await expect(scheduler.flush("window-closing")).rejects.toBe(failure);
    });
  });

  it("drops a waiting save on dispose, and ignores changes after it", () => {
    const { clock, saved, scheduler, edit } = setup();
    edit();
    scheduler.dispose();
    clock.advance(5000);
    edit();
    clock.advance(5000);
    expect(saved).toEqual([]);
    expect(scheduler.pending).toBe(false);
  });

  describe("a save that is still writing", () => {
    /** A scheduler whose `save` the test settles by hand. */
    function slowSetup() {
      const clock = new HandClock();
      const calls: SaveTrigger[] = [];
      const errors: unknown[] = [];
      const writes: { resolve(leftUnsaved?: boolean): void; reject(error: Error): void }[] = [];
      const state = { dirty: false };
      const scheduler = new SaveScheduler({
        timers: clock,
        isDirty: () => state.dirty,
        onError: (error) => errors.push(error),
        save: (trigger) => {
          calls.push(trigger);
          return new Promise<void>((resolve, reject) => {
            writes.push({
              resolve: (leftUnsaved = false) => {
                state.dirty = leftUnsaved;
                resolve();
              },
              reject,
            });
          });
        },
      });
      const edit = () => {
        state.dirty = true;
        scheduler.changed();
      };
      return { clock, calls, errors, writes, state, scheduler, edit };
    }

    it("does not start a second save when typing goes on", async () => {
      const { clock, calls, writes, edit } = slowSetup();
      edit();
      clock.advance(1000);
      edit();
      clock.advance(1000);
      expect(calls).toEqual(["typing-paused"]);
      writes[0]?.resolve(true);
      await expect.poll(() => calls).toEqual(["typing-paused", "typing-paused"]);
    });

    it("saves once when the window closes during a pause save", async () => {
      const { clock, calls, writes, scheduler, edit } = slowSetup();
      edit();
      clock.advance(1000);
      let result: boolean | undefined;
      const flushed = scheduler.flush("window-closing").then((all) => {
        result = all;
      });
      await Promise.resolve();
      expect(calls).toEqual(["typing-paused"]);
      expect(result).toBeUndefined();
      writes[0]?.resolve();
      await flushed;
      expect(calls).toEqual(["typing-paused"]);
      expect(result).toBe(true);
    });

    it("saves again for a flush when the running save failed", async () => {
      const failure = new Error("disk full");
      const { clock, calls, errors, writes, scheduler, edit } = slowSetup();
      edit();
      clock.advance(1000);
      const flushed = scheduler.flush("save-now");
      writes[0]?.reject(failure);
      await expect.poll(() => errors).toEqual([failure]);
      await expect.poll(() => calls).toEqual(["typing-paused", "save-now"]);
      writes[1]?.reject(failure);
      await expect(flushed).rejects.toBe(failure);
    });
  });
});
