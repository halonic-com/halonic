import type {
  ToolScriptArtifact,
  ToolScriptCapability,
  ToolScriptData,
  ToolScriptRunResult,
  ToolScriptWrite,
} from "@halonicjs/ports";
import { sha256Hex, toolScriptHostContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import type { ToolScriptHostCapability } from "@halonicjs/toolscript-host";
import { describe, expect, it } from "vitest";
import { createQuickJsToolScriptHost } from "./index.ts";

for (const audience of ["user", "agent"] as const) {
  toolScriptHostContract(`QuickJS, ${audience}`, async () => ({
    host: createQuickJsToolScriptHost({ audience }),
  }));
}

const write = (
  id: string,
  extra: Partial<ToolScriptHostCapability> = {},
): ToolScriptHostCapability => ({
  id,
  audience: "user",
  kind: "write",
  risk: "routine",
  call: async () => ({ saved: true }),
  ...extra,
});

interface Run {
  result: ToolScriptRunResult;
  confirmed: (readonly ToolScriptWrite[])[];
}

/** Runs `body` (the inside of `run(ctx)`) on a fresh user host. */
async function run(
  body: string,
  capabilities: readonly ToolScriptCapability[],
  header: Record<string, unknown> = {},
  input: ToolScriptData = {},
): Promise<Run> {
  const code = `export async function run(ctx) { ${body} }`;
  const hash = await sha256Hex(code);
  const artifact: ToolScriptArtifact = {
    header: {
      format: "halonic.toolscript/1",
      id: "acme.test",
      version: 1,
      audience: "user",
      uses: capabilities.map((capability) => capability.id),
      // Empty entries allow any target; a test about `touches` sets its own (S14).
      touches: Object.fromEntries(capabilities.map((capability) => [capability.id, {}])),
      ...header,
    },
    code,
    sourceHash: hash,
    codeHash: hash,
    profileVersion: 1,
  };
  const confirmed: (readonly ToolScriptWrite[])[] = [];
  const result = await createQuickJsToolScriptHost({ audience: "user" }).run({
    runId: "run-acme",
    artifact,
    registry: {
      audience: "user",
      capabilities: new Map(capabilities.map((item) => [item.id, item])),
    },
    input,
    confirm: async (writes) => {
      confirmed.push(writes);
      return true;
    },
  });
  return { result, confirmed };
}

describe("createQuickJsToolScriptHost", () => {
  verifies("toolscript-quickjs.host", () => {
    const secretHeader = { inputs: { token: { type: "string", secret: true } } };
    const secretInput = { token: "acme-value" };

    it("never lets the script read a secret input's value", async () => {
      const body =
        "const token = ctx.input.token; return { leaked: String(token).includes('acme-value') };";
      const { result } = await run(body, [], secretHeader, secretInput);
      expect(result).toMatchObject({ ok: true, output: { leaked: false } });
    });

    it("answers ctx.now() with a promise of the host's time, as its type says", async () => {
      const body =
        "const pending = ctx.now(); return { promise: pending instanceof Promise, now: typeof (await pending) };";
      const { result } = await run(body, []);
      expect(result).toMatchObject({ ok: true, output: { promise: true, now: "string" } });
    });

    it("sends a secret handle only in a declared secret field", async () => {
      const revealed: unknown[] = [];
      const capability = write("acme.set-secret@1", {
        secretFields: ["value"],
        call: async (args, context) => {
          const { value } = args as unknown as { value: never };
          revealed.push(
            (context as unknown as { secret: (handle: never) => string }).secret(value),
          );
          return null;
        },
      });
      const good = await run(
        "await ctx.acme.setSecret({ name: 'b', value: ctx.input.token });",
        [capability],
        secretHeader,
        secretInput,
      );
      expect(good.result).toMatchObject({ ok: true, calls: ["acme.set-secret@1"] });
      expect(revealed).toEqual(["acme-value"]);
      expect(good.confirmed[0]?.[0]).toMatchObject({ secretInputs: { value: "token" } });
      expect(JSON.stringify(good.confirmed)).not.toContain("acme-value");
      for (const args of [
        "{ name: ctx.input.token, value: 'x' }",
        "{ name: 'b', value: [ctx.input.token] }",
        "{ name: 'b', value: { id: ctx.input.token } }",
      ]) {
        const bad = await run(
          `await ctx.acme.setSecret(${args});`,
          [capability],
          secretHeader,
          secretInput,
        );
        expect(bad.result).toMatchObject({ ok: false, reason: "toolscript.bad-handle", calls: [] });
        expect(bad.confirmed).toEqual([]);
      }
    });

    it("refuses a write outside the header's touches before confirm", async () => {
      const header = { touches: { "acme.set-note@1": { name: "{input.names[]}" } } };
      const input = { names: ["a", "b"] };
      const inside = await run(
        "await ctx.acme.setNote({ name: 'b' });",
        [write("acme.set-note@1")],
        header,
        input,
      );
      expect(inside.result).toMatchObject({ ok: true });
      const outside = await run(
        "await ctx.acme.setNote({ name: 'c' });",
        [write("acme.set-note@1")],
        header,
        input,
      );
      expect(outside.result).toMatchObject({ ok: false, reason: "toolscript.undeclared-target" });
      expect(outside.confirmed).toEqual([]);
    });

    it("confirms a batch once and refuses an irreversible item", async () => {
      const capabilities = [
        write("acme.set-note@1"),
        write("acme.delete-note@1", { risk: "irreversible" }),
      ];
      const routine = await run(
        "return ctx.batch([{ use: 'acme.set-note@1', args: { name: 'a' } }, { use: 'acme.set-note@1', args: { name: 'b' } }]);",
        capabilities,
      );
      expect(routine.result).toMatchObject({
        ok: true,
        calls: ["acme.set-note@1", "acme.set-note@1"],
      });
      expect(routine.confirmed).toHaveLength(1);
      const mixed = await run(
        "return ctx.batch([{ use: 'acme.set-note@1', args: { name: 'a' } }, { use: 'acme.delete-note@1', args: { name: 'a' } }]);",
        capabilities,
      );
      expect(mixed.result).toMatchObject({
        ok: false,
        reason: "toolscript.irreversible-in-batch",
        calls: [],
      });
      expect(mixed.confirmed).toEqual([]);
    });

    it("adds the capability's preview lines from the frozen arguments", async () => {
      const capability = write("acme.set-note@1", {
        preview: (args) => [`Set note ${String((args as Record<string, unknown>)["name"])}`],
      });
      const { confirmed } = await run("await ctx.acme.setNote({ name: 'b' });", [capability]);
      expect(confirmed[0]?.[0]).toMatchObject({
        preview: { fromHeader: [], fromCapability: ["Set note b"] },
      });
    });
  });
});
