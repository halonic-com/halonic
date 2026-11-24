import type { ToolScriptLimits } from "@halonicjs/ports";
import { describe } from "vitest";
import { argumentCases } from "./argument-cases.ts";
import { compilerCases } from "./compiler-cases.ts";
import { conformanceCases } from "./conformance-cases.ts";
import { ctxCases, globalCases } from "./ctx-cases.ts";
import { handleCases } from "./handle-cases.ts";
import type { MakeToolScriptIsolate } from "./harness.ts";
import { limitCases } from "./limit-cases.ts";

export { compilerPaths } from "./compiler-cases.ts";
export { absentGlobals } from "./ctx-cases.ts";
export type { MakeToolScriptIsolate } from "./harness.ts";

/** Options for {@link describeToolScriptIsolate}. */
export interface ToolScriptFenceOptions {
  /** Limits the host declares instead of the defaults, such as 128 MB of memory on Cloudflare. */
  readonly declaredLimits?: Partial<ToolScriptLimits>;
}

/**
 * The fence and conformance suite every `ToolScriptIsolate` passes (ADR
 * "Halonic ToolScript", the T4 fence list in section 6). It runs plain
 * JavaScript straight in the isolate, with no static check, so each fence
 * holds on its own: the compiler paths, ambient globals, a frozen `ctx`,
 * plain-data arguments, secret handles, every limit and the shape of a
 * result.
 *
 * @example
 * describeToolScriptIsolate("QuickJS", () => createQuickJsToolScriptIsolate());
 */
export function describeToolScriptIsolate(
  name: string,
  make: MakeToolScriptIsolate,
  options: ToolScriptFenceOptions = {},
): void {
  describe(`ToolScriptIsolate fence: ${name}`, () => {
    compilerCases(make);
    globalCases(make);
    ctxCases(make);
    argumentCases(make);
    handleCases(make);
    limitCases(make);
    conformanceCases(make, options.declaredLimits ?? {});
  });
}
