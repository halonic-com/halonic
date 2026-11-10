import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { defineMessages, type Message } from "../messages/define.ts";
import { phrase, plainText, renderPhrase } from "../messages/phrase.ts";
import { progressMessages } from "../messages/progress.ts";
import { paintFor } from "./paint.ts";
import { type Clock, type LiveLine, startProgress, systemClock, terminalLine } from "./progress.ts";

const steps = defineMessages("test", {
  draftReply: () => phrase`Draft reply`,
});
const draftReply = steps.draftReply().phrase;

/** A clock that only moves when the test says so, firing each timer it passes. */
function manualClock(): Clock & { advance(ms: number): void } {
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

/** A live line that keeps what it was told: each drawn line as plain text, and "(cleared)". */
function recordedLine(): LiveLine & { readonly seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    draw: (message) => seen.push(plainText(message.phrase)),
    clear: () => seen.push("(cleared)"),
  };
}

verifies("cli.progress", () => {
  it("shows nothing for a step that ends within a second", () => {
    const clock = manualClock();
    const line = recordedLine();
    const progress = startProgress(draftReply, { live: true, line, clock });
    clock.advance(999);
    progress.end();
    expect(line.seen).toEqual([]);
  });

  it("shows one ◌ line after a second and takes it away at the end", () => {
    const clock = manualClock();
    const line = recordedLine();
    const progress = startProgress(draftReply, { live: true, line, clock });
    clock.advance(5_000);
    progress.end();
    expect(line.seen).toEqual(["◌ Draft reply", "(cleared)"]);
  });

  it("says what it's waiting for after 10 seconds of waiting, and for how long", () => {
    const clock = manualClock();
    const line = recordedLine();
    const progress = startProgress(draftReply, { live: true, line, clock });
    clock.advance(2_000);
    progress.waitingFor("Anthropic");
    clock.advance(9_000);
    expect(line.seen).toEqual(["◌ Draft reply"]);
    clock.advance(3_000);
    expect(line.seen).toEqual([
      "◌ Draft reply",
      "◌ Draft reply · waiting for Anthropic (10 s)",
      "◌ Draft reply · waiting for Anthropic (11 s)",
      "◌ Draft reply · waiting for Anthropic (12 s)",
    ]);
  });

  it("goes back to what it's doing when news comes in", () => {
    const clock = manualClock();
    const line = recordedLine();
    const progress = startProgress(draftReply, { live: true, line, clock });
    progress.waitingFor("Anthropic");
    clock.advance(10_000);
    progress.waitingFor(undefined);
    expect(line.seen.at(-1)).toBe("◌ Draft reply");
  });

  it("draws nothing at all without live lines, as in a pipe or with CI set", () => {
    const clock = manualClock();
    const line = recordedLine();
    const progress = startProgress(draftReply, { live: false, line, clock });
    progress.waitingFor("Anthropic");
    clock.advance(30_000);
    progress.end();
    expect(line.seen).toEqual([]);
  });

  it("draws nothing after the end", () => {
    const clock = manualClock();
    const line = recordedLine();
    const progress = startProgress(draftReply, { live: true, line, clock });
    clock.advance(1_000);
    progress.end();
    clock.advance(20_000);
    progress.waitingFor("Anthropic");
    expect(line.seen).toEqual(["◌ Draft reply", "(cleared)"]);
  });

  it("draws over the line in a terminal without a newline, in the stream's marks", () => {
    const written: string[] = [];
    // A terminal that isn't UTF-8, so the marks are its stand-ins.
    const paint = paintFor({ colour: false, live: true, unicode: false });
    const line = terminalLine(
      (text) => written.push(text),
      (message: Message) => renderPhrase(message.phrase, paint),
    );
    line.draw(progressMessages.waiting(draftReply, "Anthropic", 12));
    line.clear();
    expect(written).toEqual([
      "\r\u001b[2K.. Draft reply - waiting for Anthropic (12 s)",
      "\r\u001b[2K",
    ]);
  });

  it("ticks on the computer's own clock until stopped", () => {
    vi.useFakeTimers();
    try {
      const ticks: number[] = [];
      const stop = systemClock.every(1_000, () => ticks.push(systemClock.now()));
      vi.advanceTimersByTime(2_500);
      stop();
      vi.advanceTimersByTime(5_000);
      expect(ticks).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
