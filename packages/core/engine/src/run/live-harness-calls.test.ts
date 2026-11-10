import { describe, expect, it } from "vitest";
import {
  engineStoppedMessage,
  LiveHarnessCalls,
  runCancelledMessage,
} from "./live-harness-calls.ts";

describe("LiveHarnessCalls", () => {
  it("tells every call going on to stop, and resolves once each has finished", async () => {
    const calls = new LiveHarnessCalls();
    const finished: string[] = [];
    const call = calls.run("run_1", async (stop) => {
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
      calls.run("run_1", async () => {
        started = true;
      }),
    ).rejects.toThrow(engineStoppedMessage);
    expect(started).toBe(false);
  });

  it("stops only the calls of the run it names", async () => {
    const calls = new LiveHarnessCalls();
    const stopped: string[] = [];
    const callOf = (runId: string) =>
      calls.run(runId, async (stop) => {
        await new Promise<void>((resolve) => stop.onStop(resolve));
        stopped.push(runId);
        throw stop.reason;
      });
    const cancelled = callOf("run_1");
    const other = callOf("run_2");

    await calls.stop("run_1");

    expect(stopped).toEqual(["run_1"]);
    await expect(cancelled).rejects.toThrow(runCancelledMessage);
    await calls.stopAll();
    await expect(other).rejects.toThrow(engineStoppedMessage);
  });

  it("still runs a call of a run whose calls it stopped", async () => {
    const calls = new LiveHarnessCalls();
    await calls.stop("run_1");

    await expect(calls.run("run_1", async () => "ran")).resolves.toBe("ran");
  });
});
