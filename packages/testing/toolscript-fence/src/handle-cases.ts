import { isToolScriptSecretHandle, toolScriptSecretHandle } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect } from "vitest";
import { fenceIt, leavesOut } from "./fence-case.ts";
import { type MakeToolScriptIsolate, recorder, runScript, script } from "./harness.ts";

const reference = "acme-deploy-token";

/** `ctx.secrets.get()` answers with a handle; `ctx.acme.use(x)` records what it gets. */
function handleFunctions() {
  const use = recorder();
  const functions = {
    secrets: { get: async () => toolScriptSecretHandle(reference) },
    acme: { use: use.fn },
  };
  return { functions, calls: use.calls };
}

/** S7: handles are ids made per run, looked up on the host, never readable or returnable. */
export function handleCases(make: MakeToolScriptIsolate): void {
  // Every handle comes from a host function, so an isolate without them leaves the whole group out.
  if (leavesOut(make, "toolscript-fence.secret-handles")) return;
  const it = fenceIt(make);
  verifies("toolscript-fence.secret-handles", () => {
    it("gives the script an id and the host its handle back", async () => {
      const { functions, calls } = handleFunctions();
      const code = script(`
        const token = await ctx.secrets.get();
        await ctx.acme.use({ token });
        return [typeof token, token.includes(${JSON.stringify(reference)})];`);
      const result = await runScript(make, code, { functions });
      expect(result.ok && result.output).toEqual(["string", false]);
      const [argument] = calls as [{ token: unknown }];
      expect(isToolScriptSecretHandle(argument.token)).toBe(true);
      expect(argument.token).toMatchObject({ reference });
    });

    it("refuses a forged id", async () => {
      const { functions, calls } = handleFunctions();
      const code = script(`
        const token = await ctx.secrets.get();
        const forged = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
        await ctx.acme.use({ token: forged });`);
      const result = await runScript(make, code, { functions });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-handle" });
      expect(calls).toEqual([]);
    });

    it("refuses an id another run made", async () => {
      const first = handleFunctions();
      const leak = await runScript(make, script("return [...(await ctx.secrets.get())];"), first);
      expect(leak.ok).toBe(true);
      const id = leak.ok ? (leak.output as string[]).join("") : "";
      const second = handleFunctions();
      const code = script("await ctx.acme.use({ token: ctx.input.id });");
      const result = await runScript(make, code, { ...second, input: { id } });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-handle" });
      expect(second.calls).toEqual([]);
    });

    it("refuses a handle in the output", async () => {
      const { functions } = handleFunctions();
      for (const output of ["token", "{ nested: [token] }", "'token: ' + token"]) {
        const code = script(`const token = await ctx.secrets.get(); return ${output};`);
        const result = await runScript(make, code, { functions });
        expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-output" });
      }
    });

    it("refuses a handle in ctx.log", async () => {
      const { functions } = handleFunctions();
      for (const line of ["token", "'token ' + token", "{ token }"]) {
        const code = script(`const token = await ctx.secrets.get(); ctx.log(${line}); return 1;`);
        const result = await runScript(make, code, { functions });
        expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-handle" });
        expect(result.log.join("")).not.toContain(reference);
      }
    });
  });
}
