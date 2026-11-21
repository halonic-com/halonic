import type { ChatTurnRefusal, ChatTurnWaiting } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { RefusalsFeed } from "./refusals-feed.ts";

function refusal(source: string, index: number): ChatTurnRefusal {
  return { source, name: `tool ${index}`, refused: "tool", reason: `why ${index}` };
}

verifies("library.refusals-feed", () => {
  it("keeps refusals newest first, each with the time they arrived", () => {
    let minute = 0;
    const feed = new RefusalsFeed(() => new Date(Date.UTC(2026, 10, 12, 10, minute++)));
    feed.record([refusal("notes", 1)]);
    feed.record([refusal("notes", 2), refusal("mail", 3)]);
    expect(feed.refusals("notes").map((row) => row.refusal.name)).toEqual(["tool 2", "tool 1"]);
    expect(feed.refusals("notes")[0]?.at.toISOString()).toBe("2026-11-12T10:01:00.000Z");
    expect(feed.refusals("mail")).toHaveLength(1);
    expect(feed.refusals("unknown")).toEqual([]);
  });

  it("keeps the newest 20 of one source", () => {
    const feed = new RefusalsFeed();
    for (let index = 1; index <= 21; index++) feed.record([refusal("notes", index)]);
    const kept = feed.refusals("notes");
    expect(kept).toHaveLength(20);
    expect(kept[0]?.refusal.name).toBe("tool 21");
    expect(kept.at(-1)?.refusal.name).toBe("tool 2");
  });

  it("calls watchers after a record that kept something, not after an empty one, and stops after unsubscribe", () => {
    const feed = new RefusalsFeed();
    const listener = vi.fn();
    const stop = feed.subscribe(listener);
    feed.record([]);
    expect(listener).not.toHaveBeenCalled();
    feed.record([refusal("notes", 1)]);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    feed.record([refusal("notes", 2)]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps what waits for approval as the last turn left it, and clears it with an empty set", () => {
    const feed = new RefusalsFeed();
    const lookup: ChatTurnWaiting = { source: "notes", name: "lookup" };
    feed.recordWaiting([lookup, { source: "mail", name: "send" }]);
    expect(feed.waiting("notes")).toEqual([lookup]);
    feed.recordWaiting([]);
    expect(feed.waiting("notes")).toEqual([]);
    expect(feed.waiting("mail")).toEqual([]);
  });

  it("calls watchers only when the waiting set changed", () => {
    const feed = new RefusalsFeed();
    const listener = vi.fn();
    feed.subscribe(listener);
    feed.recordWaiting([]);
    feed.recordWaiting([{ source: "notes", name: "lookup" }]);
    feed.recordWaiting([{ source: "notes", name: "lookup" }]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("replaces one connector's waiting tools and keeps the others', telling watchers only of a change", () => {
    const feed = new RefusalsFeed();
    const listener = vi.fn();
    feed.subscribe(listener);
    const send: ChatTurnWaiting = { source: "mail", name: "send" };
    feed.recordWaitingOf("notes", [{ source: "notes", name: "lookup" }]);
    feed.recordWaitingOf("mail", [send]);
    feed.recordWaitingOf("notes", [{ source: "notes", name: "lookup" }]);
    expect(listener).toHaveBeenCalledTimes(2);

    feed.recordWaitingOf("notes", [{ source: "notes", name: "find" }]);
    expect(feed.waiting("notes")).toEqual([{ source: "notes", name: "find" }]);
    expect(feed.waiting("mail")).toEqual([send]);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
