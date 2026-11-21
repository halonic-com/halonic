import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { AsyncFeed } from "./async-feed.ts";

verifies("std.async-feed", () => {
  it("gives every item pushed, in order, to a reader that comes later", async () => {
    const feed = new AsyncFeed<number>();
    feed.push(1);
    feed.push(2);
    feed.end();
    const seen: number[] = [];
    for await (const item of feed) seen.push(item);
    expect(seen).toEqual([1, 2]);
  });

  it("wakes a reader that waits when an item comes, and when the feed ends", async () => {
    const feed = new AsyncFeed<string>();
    const first = feed.next();
    feed.push("ready");
    expect(await first).toEqual({ done: false, value: "ready" });
    const last = feed.next();
    feed.end();
    expect(await last).toEqual({ done: true, value: undefined });
  });

  it("ignores items pushed after the end", async () => {
    const feed = new AsyncFeed<string>();
    feed.end();
    feed.push("late");
    expect(await feed.next()).toEqual({ done: true, value: undefined });
  });

  it("drops the queue and tells the writer once when the reader leaves early", async () => {
    const left: AsyncFeed<number>[] = [];
    const feed = new AsyncFeed<number>((gone) => left.push(gone));
    feed.push(1);
    feed.push(2);
    for await (const item of feed) {
      expect(item).toBe(1);
      break;
    }
    await feed.return();
    expect(left).toEqual([feed]);
    feed.push(3);
    expect(await feed.next()).toEqual({ done: true, value: undefined });
  });

  it("ends a read that waits when the reader leaves", async () => {
    const feed = new AsyncFeed<number>();
    const waiting = feed.next();
    await feed.return();
    expect(await waiting).toEqual({ done: true, value: undefined });
  });
});
