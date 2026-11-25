import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { SwappableMessaging } from "./swappable-messaging.ts";

/** A messaging whose `changes` gives what the test pushes, and says when its reader stopped. */
function pushedChanges() {
  const fake = new FakeAgentMessaging();
  const state = { stopped: false, push: (_source: string) => {} };
  fake.changes = () => {
    const queued: string[] = [];
    let waiting: ((result: IteratorResult<string>) => void) | undefined;
    state.push = (source) => {
      if (waiting === undefined) queued.push(source);
      else waiting({ done: false, value: source });
      waiting = undefined;
    };
    const reader: AsyncIterableIterator<string> = {
      next: () => {
        const first = queued.shift();
        if (first !== undefined) return Promise.resolve({ done: false, value: first });
        if (state.stopped) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolve) => {
          waiting = resolve;
        });
      },
      return: () => {
        state.stopped = true;
        waiting?.({ done: true, value: undefined });
        return Promise.resolve({ done: true, value: undefined });
      },
      [Symbol.asyncIterator]: () => reader,
    };
    return reader;
  };
  return { fake, state };
}

function failOnError(error: unknown): never {
  throw error;
}

verifies("cli.commands.serve.messaging-mount", () => {
  describe("swapping", () => {
    it("sends every call after a swap to the new messaging", async () => {
      const first = new FakeAgentMessaging();
      first.addSource({ label: "Paperclip · Halonic" });
      const second = new FakeAgentMessaging();
      second.addSource({ label: "Paperclip · Halonic" });
      second.addSource({ label: "Paperclip · Studio" });
      const messaging = new SwappableMessaging(first, failOnError);

      expect(await messaging.listSources()).toHaveLength(1);
      messaging.swap(second, []);

      expect(await messaging.listSources()).toHaveLength(2);
    });

    it("keeps a changes reader across a swap: the old stream stops, the changed source comes, then the new stream's", async () => {
      const old = pushedChanges();
      const next = pushedChanges();
      const messaging = new SwappableMessaging(old.fake, failOnError);
      const reader = messaging.changes()[Symbol.asyncIterator]();

      old.state.push("paperclip:halonic");
      expect(await reader.next()).toEqual({ done: false, value: "paperclip:halonic" });
      messaging.swap(next.fake, ["paperclip:studio"]);
      next.state.push("paperclip:halonic");

      expect(old.state.stopped).toBe(true);
      expect(await reader.next()).toEqual({ done: false, value: "paperclip:studio" });
      expect(await reader.next()).toEqual({ done: false, value: "paperclip:halonic" });
    });

    it("stops the stream it reads when its reader stops, and a later swap reads nothing for it", async () => {
      const old = pushedChanges();
      const next = pushedChanges();
      const messaging = new SwappableMessaging(old.fake, failOnError);
      const reader = messaging.changes()[Symbol.asyncIterator]();
      const waiting = reader.next();

      await reader.return?.();
      messaging.swap(next.fake, ["paperclip:studio"]);

      expect(await waiting).toEqual({ done: true, value: undefined });
      expect(old.state.stopped).toBe(true);
      expect(next.state.stopped).toBe(false);
      expect(await reader.next()).toEqual({ done: true, value: undefined });
    });
  });
});
