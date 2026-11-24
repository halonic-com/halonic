import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createQuickJsToolScriptIsolate, quickJsIntrinsics } from "./index.ts";

const workspace = readFileSync(new URL("../../../../pnpm-workspace.yaml", import.meta.url), "utf8");

verifies("toolscript-quickjs.intrinsics", () => {
  it("pins the intrinsics: Eval on for the compiler, Proxy, typed arrays and bignum off", () => {
    expect(quickJsIntrinsics).toEqual({
      BaseObjects: true,
      Date: true,
      Eval: true,
      StringNormalize: true,
      RegExp: true,
      JSON: true,
      Proxy: false,
      MapSet: true,
      TypedArrays: false,
      Promise: true,
      BigInt: false,
      BigFloat: false,
      BigDecimal: false,
      OperatorOverloading: false,
      BignumExt: false,
    });
    expect(Object.isFrozen(quickJsIntrinsics)).toBe(true);
  });

  it("has no Proxy, typed arrays or bignum in a run", async () => {
    const names = [
      "Proxy",
      "ArrayBuffer",
      "Uint8Array",
      "DataView",
      "BigInt",
      "BigInt64Array",
      "BigFloat",
      "BigDecimal",
    ];
    const result = await createQuickJsToolScriptIsolate().run({
      runId: "acme-run",
      code: `export function run() { return ${JSON.stringify(names)}.map((name) => typeof globalThis[name]); }`,
      input: null,
      functions: {},
      limits: createQuickJsToolScriptIsolate().limits,
    });
    expect(result.ok && result.output).toEqual(names.map(() => "undefined"));
  });

  it("pins the QuickJS API to exactly 0.32.0, with the engine built from engine/SOURCES.json", () => {
    expect(workspace).toMatch(/^ {2}quickjs-emscripten-core: 0\.32\.0$/m);
    // The engine is our own build now (HAL-17780), not a variant package from npm.
    expect(workspace).not.toMatch(/@jitl\/quickjs-ng-/);
  });
});
