import type { MessagingId } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { SharedChanges } from "./shared-changes.ts";

/** An inner stream the test drives: each `open` counts, and `send` or `fail` answers its waiting read. */
class DrivenChanges {
  opened = 0;
  stopped = 0;
  #waiting:
    | { resolve: (result: IteratorResult<MessagingId>) => void; reject: (error: unknown) => void }
    | undefined;

  open = (): AsyncIterable<MessagingId> => {
    this.opened += 1;
    return {
      [Symbol.asyncIterator]: () => ({
        next: () =>
          new Promise<IteratorResult<MessagingId>>((resolve, reject) => {
            this.#waiting = { resolve, reject };
          }),
        return: async () => {
          this.stopped += 1;
          this.#waiting?.resolve({ done: true, value: undefined });
          return { done: true, value: undefined };
        },
      }),
    };
  };

  send(id: MessagingId): void {
    this.#waiting?.resolve({ done: false, value: id });
  }

  fail(error: Error): void {
    this.#waiting?.reject(error);
  }
}

verifies("services.shared-changes", () => {
  describe("SharedChanges", () => {
    it("opens the inner stream once for four readers and hands each change to all of them", async () => {
      const inner = new DrivenChanges();
      const shared = new SharedChanges(inner.open);
      const readers = [shared.listen(), shared.listen(), shared.listen(), shared.listen()];
      const reads = readers.map((reader) => reader.next());

      inner.send("paperclip:acme");

      expect(await Promise.all(reads)).toEqual(
        readers.map(() => ({ done: false, value: "paperclip:acme" })),
      );
      expect(inner.opened).toBe(1);
    });

    it("keeps a change for a reader that wasn't waiting yet", async () => {
      const inner = new DrivenChanges();
      const shared = new SharedChanges(inner.open);
      const slow = shared.listen();
      const fast = shared.listen().next();

      inner.send("paperclip:acme");
      await fast;

      expect(await slow.next()).toEqual({ done: false, value: "paperclip:acme" });
    });

    it("stops the inner stream when the last reader leaves, and a later reader opens a new one", async () => {
      const inner = new DrivenChanges();
      const shared = new SharedChanges(inner.open);
      const first = shared.listen();
      const second = shared.listen();

      await first.return?.();
      expect(inner.stopped).toBe(0);
      await second.return?.();
      expect(inner.stopped).toBe(1);

      shared.listen();
      expect(inner.opened).toBe(2);
    });

    it("hands a failure to every reader, and the next reader starts again", async () => {
      const inner = new DrivenChanges();
      const shared = new SharedChanges(inner.open);
      const reads = [shared.listen().next(), shared.listen().next()];

      inner.fail(new Error("The agent host isn't answering."));

      for (const read of reads) await expect(read).rejects.toThrow("isn't answering");
      shared.listen();
      expect(inner.opened).toBe(2);
    });
  });
});
