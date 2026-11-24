import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  isToolScriptSecretHandle,
  isToolScriptStop,
  type ToolScriptIsolate,
  type ToolScriptIsolateRequest,
  type ToolScriptIsolateResult,
  ToolScriptStop,
  toolScriptSecretHandle,
} from "./index.ts";

verifies("ports.tool-script-isolate", () => {
  typeTest("has its limits and run, which answers with a result", () => {
    expectTypeOf<keyof ToolScriptIsolate>().toEqualTypeOf<"limits" | "run">();
    expectTypeOf<ToolScriptIsolate["run"]>().parameters.toEqualTypeOf<
      [request: ToolScriptIsolateRequest]
    >();
    expectTypeOf<ToolScriptIsolate["run"]>().returns.toEqualTypeOf<
      Promise<ToolScriptIsolateResult>
    >();
  });

  it("makes a frozen secret handle and recognises only its own mark", () => {
    const handle = toolScriptSecretHandle("acme-deploy-key");
    expect(Object.isFrozen(handle)).toBe(true);
    expect(isToolScriptSecretHandle(handle)).toBe(true);
    expect(JSON.stringify(handle)).toBe('{"reference":"acme-deploy-key"}');
    for (const lookalike of [
      { reference: "acme-deploy-key" },
      JSON.parse(JSON.stringify(handle)),
      "toolscript-handle:0123",
      null,
    ]) {
      expect(isToolScriptSecretHandle(lookalike)).toBe(false);
    }
  });

  it("recognises a stop by its name and a listed reason", () => {
    const stop = new ToolScriptStop("toolscript.declined");
    expect(isToolScriptStop(stop)).toBe(true);
    expect(stop.message).toBe("toolscript.declined");
    const copy = Object.assign(new Error("declined"), {
      name: "ToolScriptStop",
      reason: "toolscript.declined",
    });
    expect(isToolScriptStop(copy)).toBe(true);
    const unlisted = Object.assign(new Error("x"), { name: "ToolScriptStop", reason: "limit.x" });
    expect(isToolScriptStop(unlisted)).toBe(false);
    expect(isToolScriptStop(new Error("toolscript.declined"))).toBe(false);
  });
});
