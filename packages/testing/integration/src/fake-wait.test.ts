import { maxIntegrationWaitMs } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import { ConformanceFailure, checkAbort, checkCase, checkHostWait } from "./checks.ts";
import { fakeWait } from "./fake-wait.ts";
import { weatherSubject } from "./fixtures/weather.ts";
import { type ConformanceSubject, runCase } from "./run.ts";

/** The weather fixture, pausing `ms` through its host before every call. */
function pausing(ms: number): ConformanceSubject {
  const weather = weatherSubject.integration;
  return {
    ...weatherSubject,
    integration: {
      ...weather,
      connect: (host) => {
        const connection = weather.connect(host);
        return {
          ...connection,
          callTool: async (name, args, signal) => {
            await host.wait(ms, signal);
            return connection.callTool(name, args, signal);
          },
        };
      },
    },
  };
}

const forecast = weatherSubject.cases[0];

describe("testing-integration.host-wait", () => {
  it("resolves at once and records the clamped pause", async () => {
    const fake = fakeWait();
    for (const ms of [2_000, Number.NaN, -1, Number.POSITIVE_INFINITY]) await fake.wait(ms);
    expect(fake.waits).toEqual([2_000, 0, 0, maxIntegrationWaitMs]);
  });

  it("rejects with the reason of an already aborted signal and records nothing", async () => {
    const fake = fakeWait();
    const reason = new Error("call cancelled");
    await expect(fake.wait(2_000, AbortSignal.abort(reason))).rejects.toBe(reason);
    expect(fake.waits).toEqual([]);
  });

  it("gives the integration the fake, so a run records its pauses without waiting", async () => {
    const run = await runCase(pausing(Number.POSITIVE_INFINITY), forecast ?? expect.unreachable());
    expect(run.error).toBeUndefined();
    expect(run.waits).toEqual([maxIntegrationWaitMs]);
  });

  it("fails a case whose call doesn't take the pauses it names", async () => {
    const toolCase = { ...(forecast ?? expect.unreachable()), waits: [2_000] };
    await expect(checkCase(pausing(2_000), toolCase)).resolves.toContain("Forecast");
    await expect(checkCase(pausing(1_000), toolCase)).rejects.toThrow(
      new ConformanceFailure('"forecast" waited [1000] ms, the case expects [2000]'),
    );
  });

  it("stops a call aborted before its pause", async () => {
    await expect(
      checkAbort(pausing(2_000), forecast ?? expect.unreachable()),
    ).resolves.toBeUndefined();
  });

  it("checks the host's clamp, an already aborted signal and abort during the wait", async () => {
    await expect(checkHostWait(weatherSubject)).resolves.toBeUndefined();
  });
});
