import { verifies } from "@halonicjs/testing-spec";
import { expect } from "vitest";
import { fenceIt } from "./fence-case.ts";
import {
  held,
  type MakeToolScriptIsolate,
  recorder,
  runScript,
  script,
  settleHost,
} from "./harness.ts";

/** Globals that would give a script effects or time outside `ctx` (ADR P5, 2.1). */
export const absentGlobals = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "setTimeout",
  "setInterval",
  "process",
  "require",
  "importScripts",
  "WebAssembly",
  "SharedArrayBuffer",
  "Atomics",
  "Proxy",
  "std",
  "os",
  "Deno",
  "Bun",
] as const;

/** No ambient authority, and nothing carried from one run to the next. */
export function globalCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  verifies("toolscript-fence.no-ambient-globals", () => {
    it("has none of the globals that reach outside the isolate", async () => {
      const names = JSON.stringify(absentGlobals);
      const result = await runScript(
        make,
        script(`return ${names}.map((name) => typeof globalThis[name]);`),
      );
      expect(result.ok && result.output).toEqual(absentGlobals.map(() => "undefined"));
    });
  });

  verifies("toolscript-fence.fresh-isolate", () => {
    it("doesn't carry a prototype write or a global from one run to the next", async () => {
      const first = await runScript(
        make,
        script(
          "Object.prototype.polluted = 1; Array.prototype.extra = 2; globalThis.leftover = 3; return 1;",
        ),
      );
      expect(first.ok).toBe(true);
      const second = await runScript(
        make,
        script("return [typeof ({}).polluted, typeof [].extra, typeof globalThis.leftover];"),
      );
      expect(second.ok && second.output).toEqual(["undefined", "undefined", "undefined"]);
    });
  });

  verifies("toolscript-fence.fresh-module-per-run", () => {
    it("starts a second run on the same isolate without the first run's globals or heap", async () => {
      const isolate = await make();
      const same = () => isolate;
      const limits = { memoryBytes: 8 * 1024 * 1024 };
      // 4 MB held in a global: a second run in the same heap would start
      // with it and run out of memory filling its own 4 MB.
      const fill = `const kept = []; for (let i = 0; i < 4; i += 1) kept.push("x".repeat(1 << 20) + i);`;
      const first = await runScript(
        same,
        script(
          `${fill} globalThis.kept = kept; Object.prototype.polluted = 1; return kept.length;`,
        ),
        { limits },
      );
      expect(first).toMatchObject({ ok: true, output: 4 });
      const second = await runScript(
        same,
        script(`
          const seen = [typeof globalThis.kept, typeof ({}).polluted];
          ${fill}
          return [...seen, kept.length];`),
        { limits },
      );
      expect(second).toMatchObject({ ok: true, output: ["undefined", "undefined", 4] });
    });
  });
}

/** `ctx` itself: frozen, no prototype, `this` ignored, nothing after the end. */
export function ctxCases(make: MakeToolScriptIsolate): void {
  verifies("toolscript-fence.ctx-frozen", () => {
    ctxShapeCases(make);
    afterEndCases(make);
  });
}

/** `ctx`, its namespaces and the input are frozen; `this` is ignored. */
function ctxShapeCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  it("gives a frozen ctx and frozen namespaces with no prototype", async () => {
    const acme = recorder();
    const code = script(`
      const ping = ctx.acme.ping;
      try { ctx.acme.ping = () => 1; } catch {}
      try { ctx.extra = 1; } catch {}
      return [
        Object.isFrozen(ctx), Object.isFrozen(ctx.acme), Object.isFrozen(ctx.acme.ping),
        Object.getPrototypeOf(ctx) === null, Reflect.getPrototypeOf(ctx.acme) === null,
        Reflect.set(ctx.acme, "ping", 1), Reflect.defineProperty(ctx, "extra", { value: 1 }),
        ctx.acme.ping === ping, Reflect.ownKeys(ctx).sort(),
      ];`);
    const result = await runScript(make, code, { functions: { acme: { ping: acme.fn } } });
    expect(result.ok && result.output).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      true,
      ["acme", "input", "log"],
    ]);
  });

  it("gives a frozen copy of the input", async () => {
    const code = script(`
      try { ctx.input.name = "changed"; } catch {}
      return [Object.isFrozen(ctx.input), Object.isFrozen(ctx.input.tags), ctx.input.name];`);
    const result = await runScript(make, code, { input: { name: "acme", tags: ["a"] } });
    expect(result.ok && result.output).toEqual([true, true, "acme"]);
  });

  it("calls a host function the same way with any this", async () => {
    const acme = recorder("pong");
    const code = script(`
      const evil = { secret: "acme" };
      return [
        await ctx.acme.ping.call(evil, { n: 1 }),
        await Reflect.apply(ctx.acme.ping, 42, [{ n: 2 }]),
        await ctx.acme.ping({ n: 3 }),
      ];`);
    const result = await runScript(make, code, { functions: { acme: { ping: acme.fn } } });
    expect(result.ok && result.output).toEqual(["pong", "pong", "pong"]);
    expect(acme.calls).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });
}

/** A saved `ctx` method does nothing after the run or a limit has ended it. */
function afterEndCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  it("never calls a saved ctx method after the run has ended", async () => {
    const slow = held();
    const acme = recorder();
    const code = script(`
      const ping = ctx.acme.ping;
      ctx.acme.slow().then(() => ping({ late: true }));
      Promise.resolve().then(() => ping({ microtask: true }));
      return "done";`);
    const functions = { acme: { ping: acme.fn, slow: slow.fn } };
    const result = await runScript(make, code, { functions });
    expect(result.ok && result.output).toBe("done");
    slow.release();
    await settleHost();
    expect(acme.calls).not.toContainEqual({ late: true });
  });

  it("never calls a saved ctx method after a limit has tripped", async () => {
    const slow = held();
    const acme = recorder();
    const code = script(`
      const ping = ctx.acme.ping;
      ctx.acme.slow().then(() => ping({ late: true }));
      for (;;) {}`);
    const functions = { acme: { ping: acme.fn, slow: slow.fn } };
    const result = await runScript(make, code, { functions, limits: { cpuMs: 100 } });
    expect(result).toMatchObject({ ok: false, reason: "limit.cpu" });
    slow.release();
    await settleHost();
    expect(acme.calls).toEqual([]);
  });

  it("never calls a host function the script called just before a limit tripped", async () => {
    const acme = recorder();
    const code = script("ctx.acme.ping({ beforeTheLoop: true }); for (;;) {}");
    const functions = { acme: { ping: acme.fn } };
    const result = await runScript(make, code, { functions, limits: { cpuMs: 100 } });
    expect(result).toMatchObject({ ok: false, reason: "limit.cpu" });
    await settleHost();
    expect(acme.calls).toEqual([]);
  });
}
