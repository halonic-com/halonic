import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { KeyAddressQuestion } from "../api.ts";
import { KeyAddressQueue } from "./key-address-queue.ts";

const gateway: KeyAddressQuestion = {
  provider: "Gateway",
  key: "gateway-key",
  origin: "https://gateway.example.com",
  allowed: ["https://api.example.com"],
};
const other: KeyAddressQuestion = { ...gateway, key: "other-key", allowed: undefined };

/** A save that answers `saved`, and counts its calls. */
function saveAnswering(saved: boolean | Error) {
  const calls: number[] = [];
  const save = async () => {
    calls.push(calls.length + 1);
    if (saved instanceof Error) throw saved;
    return saved;
  };
  return { save, calls };
}

verifies("models.key-address.allow-address", () => {
  describe("KeyAddressQueue", () => {
    it("answers allowed only once the engine's own save succeeded", async () => {
      const queue = new KeyAddressQueue();
      const { save, calls } = saveAnswering(true);
      const answer = queue.ask(gateway, { save, signal: new AbortController().signal });
      expect(queue.shown?.question).toBe(gateway);
      await queue.allow();
      await expect(answer).resolves.toBe("allowed");
      expect(calls).toEqual([1]);
      expect(queue.shown).toBeUndefined();
    });

    it("keeps the question open when the save fails or throws, and Don't allow still refuses", async () => {
      for (const failure of [false, new Error("keychain locked")]) {
        const queue = new KeyAddressQueue();
        const answer = queue.ask(gateway, {
          save: saveAnswering(failure).save,
          signal: new AbortController().signal,
        });
        await queue.allow();
        expect(queue.shown).toMatchObject({ saving: false, saveFailed: true });
        queue.refuse();
        await expect(answer).resolves.toBe("not-allowed");
      }
    });

    it("refuses without saving", async () => {
      const queue = new KeyAddressQueue();
      const { save, calls } = saveAnswering(true);
      const answer = queue.ask(gateway, { save, signal: new AbortController().signal });
      queue.refuse();
      await expect(answer).resolves.toBe("not-allowed");
      expect(calls).toEqual([]);
    });

    it("shows one question at a time, in the order they came, with how many are waiting", async () => {
      const queue = new KeyAddressQueue();
      const signal = new AbortController().signal;
      const first = queue.ask(gateway, { save: saveAnswering(true).save, signal });
      const second = queue.ask(other, { save: saveAnswering(true).save, signal });
      expect(queue.shown).toMatchObject({ question: gateway, position: 1, count: 2 });
      queue.refuse();
      await expect(first).resolves.toBe("not-allowed");
      expect(queue.shown).toMatchObject({ question: other, position: 1, count: 1 });
      await queue.allow();
      await expect(second).resolves.toBe("allowed");
    });

    it("drops a question whose wait ended, without an answer", async () => {
      const queue = new KeyAddressQueue();
      const stop = new AbortController();
      const answer = queue.ask(gateway, { save: saveAnswering(true).save, signal: stop.signal });
      stop.abort(new Error("stopped"));
      await expect(answer).rejects.toThrow("stopped");
      expect(queue.shown).toBeUndefined();
    });

    it("doesn't answer a question whose wait ended while its address was being saved", async () => {
      const queue = new KeyAddressQueue();
      const stop = new AbortController();
      let finishSave: (saved: boolean) => void = () => undefined;
      const save = () => new Promise<boolean>((resolve) => (finishSave = resolve));
      const answer = queue.ask(gateway, { save, signal: stop.signal });
      const allowing = queue.allow();
      expect(queue.shown?.saving).toBe(true);
      stop.abort(new Error("stopped"));
      finishSave(true);
      await allowing;
      await expect(answer).rejects.toThrow("stopped");
      expect(queue.shown).toBeUndefined();
    });

    it("tells its listeners when the shown question changes", async () => {
      const queue = new KeyAddressQueue();
      let heard = 0;
      const stop = queue.subscribe(() => heard++);
      const answer = queue.ask(gateway, {
        save: saveAnswering(true).save,
        signal: new AbortController().signal,
      });
      queue.refuse();
      await answer;
      stop();
      expect(heard).toBe(2);
    });
  });
});
