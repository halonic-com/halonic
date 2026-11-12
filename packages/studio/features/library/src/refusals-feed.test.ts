import type { ChatTurnRefusal } from "@halonicjs/ports";
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
});
