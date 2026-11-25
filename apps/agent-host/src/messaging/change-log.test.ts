import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChangeLog, changesWaitMs } from "./change-log.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Whether `promise` has settled, without waiting for it: only the jobs already queued run. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  await Promise.resolve();
  return done;
}

verifies("agent-host.messaging-changes-wait", () => {
  it("answers a waiting reader within one tick of a change", async () => {
    const log = new ChangeLog();
    const waiting = log.waitSince(0, changesWaitMs);

    expect(await settled(waiting)).toBe(false);
    log.note("paperclip:halonic");

    expect(await settled(waiting)).toBe(true);
    expect(await waiting).toEqual({ next: 1, sources: ["paperclip:halonic"] });
  });

  it("answers at once when a source already changed after the reader's number", async () => {
    const log = new ChangeLog();
    log.note("paperclip:halonic");

    expect(await log.waitSince(0, changesWaitMs)).toEqual({
      next: 1,
      sources: ["paperclip:halonic"],
    });
  });

  it("answers with no sources once the wait runs out", async () => {
    const log = new ChangeLog();
    log.note("paperclip:halonic");
    const waiting = log.waitSince(1, changesWaitMs);

    await vi.advanceTimersByTimeAsync(changesWaitMs - 1);
    expect(await settled(waiting)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await waiting).toEqual({ next: 1, sources: [] });
  });

  it("doesn't let one waiting reader hold back another's change", async () => {
    const acme = new ChangeLog();
    const other = new ChangeLog();
    const otherWaiting = other.waitSince(0, changesWaitMs);
    const first = acme.waitSince(0, changesWaitMs);
    const second = acme.waitSince(0, changesWaitMs);

    acme.note("paperclip:halonic");

    expect(await first).toEqual({ next: 1, sources: ["paperclip:halonic"] });
    expect(await second).toEqual({ next: 1, sources: ["paperclip:halonic"] });
    expect(await settled(otherWaiting)).toBe(false);
    await vi.advanceTimersByTimeAsync(changesWaitMs);
    expect(await otherWaiting).toEqual({ next: 0, sources: [] });
  });

  it("stops waiting when the reader goes away or the log closes, and leaves no timer", async () => {
    const log = new ChangeLog();
    const gone = new AbortController();
    const left = log.waitSince(0, changesWaitMs, gone.signal);
    const closed = log.waitSince(0, changesWaitMs);

    gone.abort();
    log.close(() => {});

    expect(await left).toEqual({ next: 0, sources: [] });
    expect(await closed).toEqual({ next: 0, sources: [] });
    expect(vi.getTimerCount()).toBe(0);
  });
});
