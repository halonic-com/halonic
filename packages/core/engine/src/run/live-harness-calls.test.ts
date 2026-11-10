import { describe, expect, it } from "vitest";
import { engineStoppedMessage, LiveHarnessCalls } from "./live-harness-calls.ts";

describe("LiveHarnessCalls", () => {
  it("tells every call going on to stop, and resolves once each has finished", async () => {
    const calls = new LiveHarnessCalls();
    const finished: string[] = [];
    const call = calls.run(async (stop) => {
      await new Promise<void>((resolve) => stop.onStop(resolve));
      await Promise.resolve();
      finished.push("call");
      throw stop.reason;
    });

    await calls.stopAll();

    expect(finished).toEqual(["call"]);
    await expect(call).rejects.toThrow(engineStoppedMessage);
  });

  it("refuses a call after it stopped them all, before the call starts anything", async () => {
    const calls = new LiveHarnessCalls();
    await calls.stopAll();
    let started = false;

    await expect(
      calls.run(async () => {
        started = true;
      }),
    ).rejects.toThrow(engineStoppedMessage);
    expect(started).toBe(false);
  });
});
