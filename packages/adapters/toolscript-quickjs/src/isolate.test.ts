import { toolScriptDefaultLimits, toolScriptSecretHandle } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { CpuMeter } from "./cpu-meter.ts";
import { HandleTable, handleIdPrefix } from "./handles.ts";
import { createQuickJsToolScriptIsolate } from "./index.ts";

verifies("toolscript-quickjs.isolate", () => {
  it("gives a run the lower of its own limits and the request's", async () => {
    const own = { ...toolScriptDefaultLimits.user, memoryBytes: 16 * 1024 * 1024 };
    const isolate = createQuickJsToolScriptIsolate({ limits: own });
    expect(isolate.limits).toBe(own);
    const result = await isolate.run({
      runId: "acme-run",
      code: "export function run() { return 1; }",
      input: null,
      functions: {},
      limits: toolScriptDefaultLimits.agent,
    });
    expect(result.limits).toEqual({
      ...toolScriptDefaultLimits.agent,
      memoryBytes: 16 * 1024 * 1024,
    });
  });

  it("refuses a host function named like ctx's own members", async () => {
    const result = await createQuickJsToolScriptIsolate().run({
      runId: "acme-run",
      code: "export function run() { return 1; }",
      input: null,
      functions: { log: async () => null },
      limits: toolScriptDefaultLimits.agent,
    });
    expect(result).toMatchObject({ ok: false, reason: "toolscript.failed" });
  });

  it("counts only the time spent inside the isolate as CPU", () => {
    let now = 0;
    const meter = new CpuMeter(100, () => now);
    meter.inside(() => {
      now += 60;
    });
    now += 5_000; // waiting on the host
    expect(meter.shouldInterrupt()).toBe(false);
    meter.inside(() => {
      now += 30;
      expect(meter.shouldInterrupt()).toBe(false);
      now += 20;
      expect(meter.shouldInterrupt()).toBe(true);
    });
    expect(meter.tripped).toBe(true);
  });

  it("interrupts every check once the run has stopped", () => {
    const meter = new CpuMeter(100, () => 0);
    meter.stop();
    expect(meter.shouldInterrupt()).toBe(true);
    expect(meter.tripped).toBe(false);
  });

  it("makes a random 128-bit id per handle, known only to its own table", () => {
    const first = new HandleTable();
    const second = new HandleTable();
    const handle = toolScriptSecretHandle("acme-token");
    const id = first.idFor(handle);
    expect(id).toMatch(new RegExp(`^${handleIdPrefix}[0-9a-f]{32}$`));
    expect(first.idFor(handle)).toBe(id);
    expect(first.handleFor(id)).toBe(handle);
    expect(second.handleFor(id)).toBeUndefined();
    expect(second.idFor(handle)).not.toBe(id);
    first.clear();
    expect(first.handleFor(id)).toBeUndefined();
  });
});
