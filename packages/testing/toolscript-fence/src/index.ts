import type { ToolScriptLimits } from "@halonicjs/ports";
import { describe } from "vitest";
import { argumentCases } from "./argument-cases.ts";
import { compilerCases } from "./compiler-cases.ts";
import { conformanceCases } from "./conformance-cases.ts";
import { ctxCases, globalCases } from "./ctx-cases.ts";
import { leavingOut } from "./fence-case.ts";
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
  /**
   * Cases this isolate leaves out by design, by title, each with a one-line
   * reason, such as a worker that takes no host functions. They aren't
   * registered, and a title that names no case fails the suite's cases.
   */
  readonly leaveOut?: Readonly<Record<string, string>>;
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
    leavingOut(make, options.leaveOut ?? {});
    compilerCases(make);
    globalCases(make);
    ctxCases(make);
    argumentCases(make);
    handleCases(make);
    limitCases(make);
    conformanceCases(make, options.declaredLimits ?? {});
  });
}
