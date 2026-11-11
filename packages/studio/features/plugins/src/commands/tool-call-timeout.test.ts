import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginToolCaller } from "./plugin-command-dialog.tsx";
import { timedToolCaller } from "./tool-call-timeout.ts";

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => vi.useRealTimers());

/** A caller whose one call answers or fails when the test says. */
function heldCaller() {
  let settle: { resolve: (answer: string) => void; reject: (error: Error) => void } | undefined;
  const caller: PluginToolCaller = {
    call: () =>
      new Promise<string>((resolve, reject) => {
        settle = { resolve, reject };
      }),
  };
  return { caller, settle: () => settle };
}

verifies("plugins.palette-commands", () => {
  it("passes on an answer that comes in time, and clears its timer", async () => {
    const held = heldCaller();
    const answer = timedToolCaller(held.caller).call("weather", "forecast", {});
    held.settle()?.resolve("Sunny");
    await expect(answer).resolves.toBe("Sunny");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes on the tool's own failure", async () => {
    const held = heldCaller();
    const answer = timedToolCaller(held.caller).call("weather", "forecast", {});
    held.settle()?.reject(new Error("the service is down"));
    await expect(answer).rejects.toThrow("the service is down");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails a call with no answer once its time is up, and drops a later answer", async () => {
    const held = heldCaller();
    const answer = timedToolCaller(held.caller, 5_000).call("weather", "forecast", {});
    const failed = expect(answer).rejects.toThrow("the plugin didn't answer in 5 seconds");
    await vi.advanceTimersByTimeAsync(4_999);
    held.settle();
    await vi.advanceTimersByTimeAsync(1);
    await failed;
    held.settle()?.resolve("Too late");
  });
});
