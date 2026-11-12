import { type StopSignal, StopSource } from "@halonicjs/std";
import { describe, expect, it } from "vitest";
import { abortOnStop } from "./abort-on-stop.ts";

/** A stop signal that counts the listeners it holds. */
function countedStop() {
  const source = new StopSource();
  let listeners = 0;
  const signal: StopSignal = {
    get stopped() {
      return source.signal.stopped;
    },
    get reason() {
      return source.signal.reason;
    },
    throwIfStopped: () => source.signal.throwIfStopped(),
    onStop(listener) {
      listeners += 1;
      const remove = source.signal.onStop(listener);
      return () => {
        listeners -= 1;
        remove();
      };
    },
  };
  return { source, signal, listeners: () => listeners };
}

describe("abortOnStop", () => {
  it("aborts the call's signal with the stop's reason", async () => {
    const { source, signal } = countedStop();
    const reason = new Error("The run was cancelled while the model was answering.");
    const call = abortOnStop(
      signal,
      (abort) =>
        new Promise<never>((_resolve, reject) => {
          abort.addEventListener("abort", () => reject(abort.reason));
        }),
    );
    source.stop(reason);
    await expect(call).rejects.toBe(reason);
  });

  it("removes its listener once the call has ended, whether it answered or failed", async () => {
    const { signal, listeners } = countedStop();
    await abortOnStop(signal, async () => "answer");
    await expect(
      abortOnStop(signal, async () => {
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");
    expect(listeners()).toBe(0);
  });
});
