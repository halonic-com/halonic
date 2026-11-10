import type { Clock } from "../output/progress.ts";

/** A clock that only moves when the test says so, firing each timer it passes. */
export function manualClock(): Clock & { advance(ms: number): void } {
  let now = 0;
  const timers = new Set<{ readonly ms: number; next: number; readonly tick: () => void }>();
  return {
    now: () => now,
    every(ms, tick) {
      const timer = { ms, next: now + ms, tick };
      timers.add(timer);
      return () => timers.delete(timer);
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers].filter((timer) => timer.next <= until);
        const first = due.sort((a, b) => a.next - b.next)[0];
        if (first === undefined) {
          break;
        }
        now = first.next;
        first.next += first.ms;
        first.tick();
      }
      now = until;
    },
  };
}
