import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  effectiveToolScriptLimits,
  type ToolScriptHost,
  type ToolScriptRunRequest,
  type ToolScriptRunResult,
  toolScriptCapabilityPath,
  toolScriptDefaultLimits,
  toolScriptReasons,
} from "./index.ts";

verifies("ports.tool-script-host", () => {
  typeTest("has an audience, its limits and run, which answers with a result", () => {
    expectTypeOf<keyof ToolScriptHost>().toEqualTypeOf<"audience" | "limits" | "run">();
    expectTypeOf<ToolScriptHost["run"]>().parameters.toEqualTypeOf<
      [request: ToolScriptRunRequest]
    >();
    expectTypeOf<ToolScriptHost["run"]>().returns.toEqualTypeOf<Promise<ToolScriptRunResult>>();
  });

  it("has the ADR's default limits for each audience", () => {
    expect(toolScriptDefaultLimits.user).toMatchObject({ calls: 100, wallClockMs: null });
    expect(toolScriptDefaultLimits.agent).toMatchObject({ calls: 50, wallClockMs: 60_000 });
    for (const limits of Object.values(toolScriptDefaultLimits)) {
      expect(limits).toMatchObject({
        memoryBytes: 32 * 1024 * 1024,
        cpuMs: 2_000,
        inputBytes: 16 * 1024,
        outputBytes: 64 * 1024,
        argumentBytes: 8 * 1024,
        argumentDepth: 8,
        argumentItems: 100,
      });
    }
  });

  it("only lowers limits, and ignores a null wall clock", () => {
    const limits = effectiveToolScriptLimits(
      toolScriptDefaultLimits.agent,
      { calls: 10, cpuMs: 5_000 },
      undefined,
      { calls: 20, wallClockMs: null },
    );
    expect(limits).toMatchObject({ calls: 10, cpuMs: 2_000, wallClockMs: 60_000 });
    const user = effectiveToolScriptLimits(toolScriptDefaultLimits.user, { wallClockMs: 1_000 });
    expect(user.wallClockMs).toBe(1_000);
  });

  it("refuses a limit that isn't a positive whole number, or isn't a limit", () => {
    const host = toolScriptDefaultLimits.agent;
    expect(() => effectiveToolScriptLimits(host, { calls: 0 })).toThrow(RangeError);
    expect(() => effectiveToolScriptLimits(host, { cpuMs: 1.5 })).toThrow(RangeError);
    const unknown = { network: 1 } as unknown as Partial<typeof host>;
    expect(() => effectiveToolScriptLimits(host, unknown)).toThrow(RangeError);
  });

  it("places a capability on ctx by its namespace and camel-cased name", () => {
    expect(toolScriptCapabilityPath("github.set-variable@1")).toEqual({
      namespace: "github",
      method: "setVariable",
    });
    expect(toolScriptCapabilityPath("paperclip.task-get@12")).toEqual({
      namespace: "paperclip",
      method: "taskGet",
    });
    for (const bad of [
      "Github.setVariable@1",
      "github.set-variable",
      "github.set--x@1",
      "a.b@0",
      "a.b.c@1",
    ]) {
      expect(toolScriptCapabilityPath(bad), bad).toBeUndefined();
    }
  });

  it("lists every reason once, each a limit or a toolscript code", () => {
    expect(new Set(toolScriptReasons).size).toBe(toolScriptReasons.length);
    for (const reason of toolScriptReasons) expect(reason).toMatch(/^(limit|toolscript)\.[a-z-]+$/);
  });
});
