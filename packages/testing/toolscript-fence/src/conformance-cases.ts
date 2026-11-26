import {
  effectiveToolScriptLimits,
  type ToolScriptIsolateValue,
  type ToolScriptLimits,
  toolScriptDefaultLimits,
  toolScriptMessageCharacters,
  toolScriptReasons,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect } from "vitest";
import { fenceIt } from "./fence-case.ts";
import { type MakeToolScriptIsolate, recorder, runScript, script } from "./harness.ts";

/** Every host answers alike: its real limits, listed reasons, short messages without frames. */
export function conformanceCases(
  make: MakeToolScriptIsolate,
  declaredLimits: Partial<ToolScriptLimits>,
): void {
  const it = fenceIt(make);
  verifies("toolscript-fence.conformance", () => {
    it("reports the limits it applied, the host's declared ones included", async () => {
      const isolate = await make();
      expect(isolate.limits).toMatchObject(declaredLimits);
      const result = await runScript(make, script("return 1;"), { limits: { calls: 7 } });
      const expected = effectiveToolScriptLimits(isolate.limits, toolScriptDefaultLimits.agent, {
        calls: 7,
      });
      expect(result.limits).toEqual(expected);
    });

    it("answers a script's error with its message and no stack frames", async () => {
      const code = script(`
        function deep() { throw new Error("acme broke"); }
        deep();`);
      const result = await runScript(make, code);
      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
          reason: "toolscript.script-error",
          message: "acme broke",
        }),
      );
    });

    it("cuts a long error message and never passes a host function's own message on", async () => {
      const long = await runScript(make, script(`throw new Error("x".repeat(1000));`));
      expect(!long.ok && long.message).toHaveLength(toolScriptMessageCharacters);
      const failing = async () => {
        throw new Error("upstream said: acme-internal-host.example 500");
      };
      const result = await runScript(make, script("await ctx.acme.fail(); return 1;"), {
        functions: { acme: { fail: failing } },
      });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.capability-failed" });
      expect(JSON.stringify(result)).not.toContain("acme-internal-host");
    });

    failureCases(make);
  });
}

/** Bad input and every kind of failure end with a listed reason. */
function failureCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  it("answers input that isn't plain data with toolscript.bad-input", async () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    for (const input of [{ run: () => 1 }, cycle, { when: new Date(0) }]) {
      const result = await runScript(make, script("return 1;"), {
        input: input as unknown as ToolScriptIsolateValue,
      });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-input" });
    }
  });

  it("answers every failure with a listed reason", async () => {
    const acme = recorder();
    const failures = [
      script("throw 1;"),
      script("return undefinedName;"),
      script("return () => 1;"),
      "export const notRun = 1;",
      "this is not JavaScript",
      script("await new Promise(() => {});"),
    ];
    for (const code of failures) {
      const result = await runScript(make, code, { functions: { acme: { ping: acme.fn } } });
      expect(result.ok, code).toBe(false);
      if (!result.ok) expect(toolScriptReasons).toContain(result.reason);
    }
  });
}
