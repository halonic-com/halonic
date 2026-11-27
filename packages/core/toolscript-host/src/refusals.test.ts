import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeCapability, ctxCall, runAcme } from "./acme.test-helper.ts";
import { holdsHandle } from "./secrets.ts";

const refusal = (reason: string) => ({ ok: false, reason, calls: [], log: [] });

describe("refusals before and during a run", () => {
  verifies("toolscript-host.audience", () => {
    it("refuses code that doesn't match its codeHash", async () => {
      const { result } = await runAcme(async () => null, {
        capabilities: [],
        codeHash: "0".repeat(64),
      });
      expect(result).toEqual(refusal("toolscript.code-hash-mismatch"));
    });

    it("refuses a uses entry the registry lacks", async () => {
      const { result } = await runAcme(async () => null, {
        capabilities: [],
        uses: ["acme.missing@1"],
      });
      expect(result).toEqual(refusal("toolscript.unknown-capability"));
    });

    it("refuses a uses entry that would take one of ctx's own members", async () => {
      const { result } = await runAcme(async () => null, {
        capabilities: [acmeCapability("batch.run@1")],
      });
      expect(result).toEqual(refusal("toolscript.bad-artifact"));
    });

    it("refuses touches of the wrong shape and a header limit that isn't a whole number", async () => {
      for (const header of [
        { touches: ["acme"] },
        { touches: { a: "b" } },
        { limits: { calls: 0 } },
      ]) {
        const { result } = await runAcme(async () => null, { capabilities: [], header });
        expect(result).toEqual(refusal("toolscript.bad-artifact"));
      }
    });
  });

  verifies("toolscript-host.batch", () => {
    it("refuses a batch that isn't a list of { use, args } items", async () => {
      for (const items of [[], "acme", [null], [{ use: "acme.set-note@1" }]]) {
        const { result } = await runAcme(async (ctx) => ctxCall(ctx, "batch", items), {
          capabilities: [acmeCapability("acme.set-note@1")],
        });
        expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-argument" });
      }
    });
  });

  verifies("toolscript-host.secret-fields", () => {
    it("lets the capability read nothing once the run has ended", async () => {
      let later: (() => string | undefined) | undefined;
      const capability = acmeCapability("acme.set-secret@1", {
        secretFields: ["value"],
        call: async (args, context) => {
          const { value } = args as unknown as { value: never };
          later = () => (context as unknown as { secret: (handle: never) => string }).secret(value);
          return null;
        },
      });
      const { result } = await runAcme(
        async (ctx) => {
          const input = ctx["input"] as Record<string, unknown>;
          return ctxCall(ctx, "acme.setSecret", { value: input["token"] });
        },
        {
          capabilities: [capability],
          header: { inputs: { token: { type: "string", secret: true } } },
          input: { token: "acme-value" },
        },
      );
      expect(result).toMatchObject({ ok: true });
      expect(later?.()).toBeUndefined();
    });

    it("finds a handle nested anywhere in a value", () => {
      expect(holdsHandle({ list: [1, "a", { deep: null }] })).toBe(false);
    });
  });
});
