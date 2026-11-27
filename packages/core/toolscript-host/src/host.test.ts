import {
  isToolScriptSecretHandle,
  type ToolScriptData,
  type ToolScriptSecretHandle,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type AcmeContext,
  acmeCapability,
  ctxCall,
  inputField,
  runAcme,
} from "./acme.test-helper.ts";
import type { ToolScriptHostCallContext, ToolScriptHostWrite } from "./capability.ts";

const setNote = (ctx: AcmeContext, args: unknown) => ctxCall(ctx, "acme.setNote", args);

describe("createToolScriptHost", () => {
  verifies("toolscript-host.audience", () => {
    it("refuses an artifact of the other audience before anything runs", async () => {
      let ran = false;
      const { result } = await runAcme(
        async () => {
          ran = true;
        },
        { capabilities: [], hostAudience: "agent" },
      );
      expect(result).toEqual({
        ok: false,
        reason: "toolscript.wrong-audience",
        calls: [],
        log: [],
      });
      expect(ran).toBe(false);
    });

    it("refuses a capability of the other audience in uses", async () => {
      const filing = acmeCapability("stepper.request@1", {}, "agent");
      const { result } = await runAcme(async () => null, { capabilities: [filing] });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.wrong-audience", calls: [] });
    });

    it("gives ctx only the capabilities in uses, frozen, with fail, now and batch", async () => {
      const { result } = await runAcme(
        async (ctx) => ({
          members: Object.keys(ctx).sort(),
          frozen: Object.isFrozen(ctx),
          now: await ctxCall(ctx, "now"),
        }),
        { capabilities: [acmeCapability("acme.get-note@1", { kind: "read" })] },
      );
      expect(result).toMatchObject({
        ok: true,
        output: {
          members: ["acme", "batch", "fail", "input", "log", "now"],
          frozen: true,
          now: "2026-01-01T00:00:00.000Z",
        },
      });
    });

    it("gives an agent run's ctx no batch", async () => {
      const { result } = await runAcme(async (ctx) => Object.keys(ctx).sort(), {
        capabilities: [acmeCapability("stepper.request@1", { kind: "read" }, "agent")],
        audience: "agent",
      });
      expect(result).toMatchObject({
        ok: true,
        output: ["fail", "input", "log", "now", "stepper"],
      });
    });

    it("refuses two uses entries that share a place on ctx", async () => {
      const { result } = await runAcme(async () => null, {
        capabilities: [acmeCapability("acme.set-note@1"), acmeCapability("acme.set-note@2")],
      });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-artifact" });
    });

    it("stops with ctx.fail's message", async () => {
      const { result } = await runAcme(async (ctx) => ctxCall(ctx, "fail", "nothing to do"), {
        capabilities: [],
      });
      expect(result).toEqual({
        ok: false,
        reason: "toolscript.failed",
        message: "nothing to do",
        calls: [],
        log: [],
      });
    });
  });

  verifies("toolscript-host.secret-fields", () => {
    const header = { inputs: { token: { type: "string", secret: true } } };
    const input = { token: "acme-value", name: "b" };

    it("gives the script a handle, never the value", async () => {
      let seen: unknown;
      await runAcme(
        async (ctx) => {
          seen = inputField(ctx, "token");
        },
        { capabilities: [], header, input },
      );
      expect(isToolScriptSecretHandle(seen)).toBe(true);
      expect(JSON.stringify(seen)).not.toContain("acme-value");
    });

    it("lets the capability read the value in a declared secret field only", async () => {
      const revealed: (string | undefined)[] = [];
      const capability = acmeCapability("acme.set-secret@1", {
        secretFields: ["value"],
        call: async (args, context) => {
          const { value } = args as unknown as { value: ToolScriptSecretHandle };
          revealed.push((context as ToolScriptHostCallContext).secret(value));
          return null;
        },
      });
      const script = async (ctx: AcmeContext) => {
        const token = inputField(ctx, "token");
        await ctxCall(ctx, "acme.setSecret", { name: "b", value: token });
      };
      const { result, confirmed } = await runAcme(script, {
        capabilities: [capability],
        header,
        input,
      });
      expect(result).toMatchObject({ ok: true, calls: ["acme.set-secret@1"] });
      expect(revealed).toEqual(["acme-value"]);
      const write = confirmed[0]?.[0] as ToolScriptHostWrite;
      expect(isToolScriptSecretHandle((write.args as { value: unknown }).value)).toBe(true);
      expect(write.secretInputs).toEqual({ value: "token" });
      expect(JSON.stringify(write)).not.toContain("acme-value");
    });

    it("refuses a handle nested inside a declared secret field", async () => {
      const capability = acmeCapability("acme.set-secret@1", { secretFields: ["value", "name"] });
      for (const wrap of [
        (token: unknown) => ({ value: [token] }),
        (token: unknown) => ({ name: { id: token } }),
      ]) {
        const script = (ctx: AcmeContext) =>
          ctxCall(ctx, "acme.setSecret", wrap(inputField(ctx, "token")));
        const { result, confirmed } = await runAcme(script, {
          capabilities: [capability],
          header,
          input,
        });
        expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-handle", calls: [] });
        expect(confirmed).toEqual([]);
      }
    });

    it("refuses a handle in a field that isn't declared secret", async () => {
      const capability = acmeCapability("acme.set-secret@1", { secretFields: ["value"] });
      const script = async (ctx: AcmeContext) => {
        const token = inputField(ctx, "token");
        await ctxCall(ctx, "acme.setSecret", { name: token, value: "plain" });
      };
      const { result, confirmed } = await runAcme(script, {
        capabilities: [capability],
        header,
        input,
      });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-handle", calls: [] });
      expect(confirmed).toEqual([]);
    });
  });

  verifies("toolscript-host.frozen-writes", () => {
    it("checks, previews, confirms and sends one frozen object", async () => {
      const seen: ToolScriptData[] = [];
      const sent: ToolScriptData[] = [];
      const capability = acmeCapability("acme.set-note@1", {
        acceptsArguments: (args) => seen.push(args) > 0,
        preview: (args) => {
          seen.push(args);
          return ["acme note"];
        },
        call: async (args) => {
          sent.push(args);
          return { saved: true };
        },
      });
      const { result, confirmed } = await runAcme((ctx) => setNote(ctx, { name: "b" }), {
        capabilities: [capability],
      });
      expect(result).toMatchObject({
        ok: true,
        output: { saved: true },
        calls: ["acme.set-note@1"],
      });
      const confirmedArgs = confirmed[0]?.[0]?.args;
      expect(confirmedArgs).toEqual({ name: "b" });
      expect(Object.isFrozen(confirmedArgs)).toBe(true);
      expect(seen).toHaveLength(2);
      for (const args of [...seen, ...sent]) expect(args).toBe(confirmedArgs);
    });

    it("sends nothing when the write is declined", async () => {
      let sent = false;
      const capability = acmeCapability("acme.set-note@1", {
        call: async () => {
          sent = true;
          return null;
        },
      });
      const { result } = await runAcme((ctx) => setNote(ctx, { name: "b" }), {
        capabilities: [capability],
        decline: true,
      });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.declined", calls: [] });
      expect(sent).toBe(false);
    });

    it("refuses arguments the capability's schema refuses, before confirm", async () => {
      const capability = acmeCapability("acme.set-note@1", { acceptsArguments: () => false });
      const { result, confirmed } = await runAcme((ctx) => setNote(ctx, { name: "b" }), {
        capabilities: [capability],
      });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-argument" });
      expect(confirmed).toEqual([]);
    });

    it("refuses an answer that isn't plain data", async () => {
      const capability = acmeCapability("acme.get-note@1", {
        kind: "read",
        call: async () => new Date(0) as unknown as ToolScriptData,
      });
      const { result } = await runAcme(async (ctx) => ctxCall(ctx, "acme.getNote"), {
        capabilities: [capability],
      });
      expect(result).toMatchObject({ ok: false, reason: "toolscript.capability-failed" });
    });
  });
});
