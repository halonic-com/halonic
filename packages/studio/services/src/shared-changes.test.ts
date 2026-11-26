import type { MessagingId } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { SharedChanges } from "./shared-changes.ts";

/** An inner stream the test drives: each `open` counts, and `send` or `fail` answers its waiting read. */
class DrivenChanges {
  opened = 0;
  stopped = 0;
  /** Set to make the inner stream's `return` fail. */
  stopError: Error | undefined;
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
          if (this.stopError !== undefined) throw this.stopError;
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

  finish(): void {
    this.#waiting?.resolve({ done: true, value: undefined });
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

    it("serves a for-await loop, and a break leaves the shared stream", async () => {
      const inner = new DrivenChanges();
      const shared = new SharedChanges(inner.open);
      const seen: MessagingId[] = [];
      const loop = (async () => {
        for await (const source of shared.listen()) {
          seen.push(source);
          break;
        }
      })();

      inner.send("paperclip:acme");
      await loop;

      expect(seen).toEqual(["paperclip:acme"]);
      expect(inner.stopped).toBe(1);
    });

    it("ends every reader when the inner stream ends, also one that reads afterwards", async () => {
      const inner = new DrivenChanges();
      const shared = new SharedChanges(inner.open);
      const waiting = shared.listen();
      const late = shared.listen();
      const read = waiting.next();

      inner.finish();

      expect(await read).toEqual({ done: true, value: undefined });
      expect(await late.next()).toEqual({ done: true, value: undefined });
      await late.return?.();
      expect(inner.stopped).toBe(0);
    });

    it("hands a failure to a reader that reads after it", async () => {
      const inner = new DrivenChanges();
      const shared = new SharedChanges(inner.open);
      const waiting = shared.listen();
      const late = shared.listen();
      const read = waiting.next();

      inner.fail(new Error("The agent host isn't answering."));

      await expect(read).rejects.toThrow("isn't answering");
      await expect(late.next()).rejects.toThrow("isn't answering");
    });

    it("logs a failure to stop the inner stream rather than dropping it", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const inner = new DrivenChanges();
      inner.stopError = new Error("The agent host isn't answering.");
      const shared = new SharedChanges(inner.open);

      await shared.listen().return?.();
      await vi.waitFor(() => expect(logged).toHaveBeenCalledTimes(1));

      expect(logged).toHaveBeenCalledWith("Stopping the shared changes stream", inner.stopError);
      logged.mockRestore();
    });

    it("leaves an inner stream that can't be stopped to end on its own", async () => {
      let opened = 0;
      const shared = new SharedChanges(() => {
        opened += 1;
        return {
          [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => undefined) }),
        };
      });

      await shared.listen().return?.();
      shared.listen();

      expect(opened).toBe(2);
    });
  });
});
