import { type ToolScriptIsolateValue, toolScriptDefaultLimits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runInQuickJs } from "./isolate.ts";
import { preludeSlots, preludeSource } from "./prelude.ts";

/** Runs `body` as the script's `run(ctx)`, recording each `ctx.acme.ping` call. */
async function run(body: string, prelude?: string) {
  const calls: ToolScriptIsolateValue[] = [];
  const ping = async (args: ToolScriptIsolateValue) => {
    calls.push(args);
    return null;
  };
  const result = await runInQuickJs(
    {
      runId: "acme-run",
      code: `await Promise.resolve();\nexport async function run(ctx) {\n${body}\n}`,
      input: null,
      functions: { acme: { ping } },
      limits: toolScriptDefaultLimits.agent,
    },
    toolScriptDefaultLimits.agent,
    prelude,
  );
  return { result, calls };
}

/** The prelude with one statement taken out. */
function preludeWithout(statement: string): string {
  expect(preludeSource).toContain(statement);
  return preludeSource.replace(statement, "");
}

const slotChecks = `
  const thrower = globalThis.eval;
  const owners = {
    globalThis,
    functionPrototype: Function.prototype,
    asyncFunctionPrototype: Object.getPrototypeOf(async function () {}),
    generatorFunctionPrototype: Object.getPrototypeOf(function* () {}),
    asyncGeneratorFunctionPrototype: Object.getPrototypeOf(async function* () {}),
  };
  const slots = ${JSON.stringify(preludeSlots)};
  for (const [owner, key] of slots) {
    const target = owners[owner];
    try { Object.defineProperty(target, key, { value: () => 1, writable: true }); } catch {}
    try { delete target[key]; } catch {}
    try { target[key] = () => 1; } catch {}
  }
  const report = slots.map(([owner, key]) => {
    const slot = Object.getOwnPropertyDescriptor(owners[owner], key);
    return slot.value === thrower && slot.writable === false && slot.configurable === false;
  });
  return [
    report,
    Object.isFrozen(thrower),
    Object.isFrozen(Function.prototype),
    Object.getPrototypeOf(thrower) === Function.prototype,
    thrower.constructor === thrower,
  ];`;

verifies("toolscript-quickjs.eval-prelude", () => {
  it("replaces every slot with one frozen thrower that a script can't redefine, delete or assign", async () => {
    const { result } = await run(slotChecks);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.output).toEqual([
      preludeSlots.map(() => true),
      true,
      true,
      true,
      true,
    ]);
  });

  it("never runs the script when the prelude throws", async () => {
    const { result, calls } = await run(
      "await ctx.acme.ping('ran'); return 1;",
      "throw new Error('broken prelude')",
    );
    expect(result).toMatchObject({ ok: false, reason: "toolscript.failed" });
    expect(calls).toEqual([]);
  });

  it("never runs the script when the host's own check finds a slot it didn't replace", async () => {
    for (const statement of [
      'define(globalThis, "eval", slot);',
      'define(globalThis, "Function", slot);',
      "Object.freeze(thrower);",
      "Object.freeze(functionPrototype);",
    ]) {
      const { result, calls } = await run(
        "await ctx.acme.ping('ran'); return 1;",
        preludeWithout(statement),
      );
      expect(result, statement).toMatchObject({ ok: false, reason: "toolscript.failed" });
      expect(calls).toEqual([]);
    }
  });

  it("never runs the script when a slot is left writable", async () => {
    const writable = preludeSource.replace(
      "const slot = { value: thrower, writable: false,",
      "const slot = { value: thrower, writable: true,",
    );
    expect(writable).not.toBe(preludeSource);
    const { result, calls } = await run("await ctx.acme.ping('ran'); return 1;", writable);
    expect(result).toMatchObject({ ok: false, reason: "toolscript.failed" });
    expect(calls).toEqual([]);
  });

  it("runs a script with top-level await under the real prelude", async () => {
    const { result, calls } = await run("await ctx.acme.ping('ran'); return 'done';");
    expect(result).toMatchObject({ ok: true, output: "done" });
    expect(calls).toEqual(["ran"]);
  });
});
