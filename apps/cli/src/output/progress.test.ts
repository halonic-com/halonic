import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { defineMessages } from "../messages/define.ts";
import { phrase, plainText } from "../messages/phrase.ts";
import { progressMessages } from "../messages/progress.ts";
import { manualClock } from "../test/manual-clock.ts";
import { type LiveLine, startProgress, systemClock, terminalLine } from "./progress.ts";

const steps = defineMessages("test", {
  draftReply: () => phrase`Draft reply`,
});
const draftReply = steps.draftReply().phrase;

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

  it("gives a wait of a minute or more in minutes and seconds", () => {
    const clock = manualClock();
    const line = recordedLine();
    const progress = startProgress(draftReply, { live: true, line, clock });
    progress.waitingFor("Anthropic");
    clock.advance(59_000);
    expect(line.seen.at(-1)).toBe("◌ Draft reply · waiting for Anthropic (59 s)");
    clock.advance(1_000);
    expect(line.seen.at(-1)).toBe("◌ Draft reply · waiting for Anthropic (1 min)");
    clock.advance(287_000);
    expect(line.seen.at(-1)).toBe("◌ Draft reply · waiting for Anthropic (5 min 47 s)");
    clock.advance(13_000);
    expect(line.seen.at(-1)).toBe("◌ Draft reply · waiting for Anthropic (6 min)");
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
    const line = terminalLine({
      write: (text) => written.push(text),
      style: { colour: false, live: true, unicode: false },
      columns: () => 80,
    });
    line.draw(progressMessages.waiting(draftReply, "Anthropic", 12));
    line.clear();
    expect(written).toEqual([
      "\r\u001b[2K.. Draft reply - waiting for Anthropic (12 s)",
      "\r\u001b[2K",
    ]);
  });

  it("cuts the line to the terminal's width, less one column, at each draw", () => {
    const written: string[] = [];
    let columns = 32;
    const line = terminalLine({
      write: (text) => written.push(text),
      style: { colour: false, live: true, unicode: true },
      columns: () => columns,
    });
    const waiting = progressMessages.waiting(draftReply, "Anthropic", 12);
    line.draw(waiting);
    columns = 80;
    line.draw(waiting);
    expect(written).toEqual([
      "\r\u001b[2K◌ Draft reply · waiting for An…",
      "\r\u001b[2K◌ Draft reply · waiting for Anthropic (12 s)",
    ]);
  });

  it("cuts a coloured line without cutting its escape codes", () => {
    const written: string[] = [];
    const line = terminalLine({
      write: (text) => written.push(text),
      style: { colour: true, live: true, unicode: false },
      columns: () => 44,
    });
    line.draw(progressMessages.waiting(draftReply, "Anthropic", 125));
    // 43 characters: the dimmed time is cut inside its dim, which still ends, and "..." ends the line.
    expect(written).toEqual([
      "\r\u001b[2K.. Draft reply \u001b[2m-\u001b[22m waiting for Anthropic \u001b[2m(\u001b[22m...",
    ]);
  });

  it("draws the whole line when the terminal doesn't say how wide it is", () => {
    const written: string[] = [];
    const line = terminalLine({
      write: (text) => written.push(text),
      style: { colour: false, live: true, unicode: true },
      columns: () => undefined,
    });
    line.draw(progressMessages.waiting(draftReply, "Anthropic", 347));
    expect(written).toEqual(["\r\u001b[2K◌ Draft reply · waiting for Anthropic (5 min 47 s)"]);
  });

  it("ticks on the computer's own clock until stopped, without keeping Node running", () => {
    vi.useFakeTimers();
    const unref = vi.spyOn(globalThis, "setInterval");
    try {
      const ticks: number[] = [];
      const start = systemClock.now();
      const stop = systemClock.every(1_000, () => ticks.push(systemClock.now() - start));
      vi.advanceTimersByTime(2_500);
      stop();
      vi.advanceTimersByTime(5_000);
      expect(ticks).toEqual([1_000, 2_000]);
      expect(unref.mock.results[0]?.value.hasRef()).toBe(false);
    } finally {
      unref.mockRestore();
      vi.useRealTimers();
    }
  });
});
