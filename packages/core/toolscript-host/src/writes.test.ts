import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type AcmeContext, acmeCapability, ctxCall, runAcme } from "./acme.test-helper.ts";
import type { ToolScriptHostWrite } from "./capability.ts";
import { expandTemplate } from "./touches.ts";

const setNote = (ctx: AcmeContext, args: unknown) => ctxCall(ctx, "acme.setNote", args);

describe("batches, touches and previews", () => {
  verifies("toolscript-host.batch", () => {
    it("confirms a batch once and sends its writes in order", async () => {
      const sent: string[] = [];
      const capability = (id: string) =>
        acmeCapability(id, {
          call: async () => {
            sent.push(id);
            return null;
          },
        });
      const items = [
        { use: "acme.set-note@1", args: { name: "a" } },
        { use: "acme.set-tag@1", args: { tag: "b" } },
      ];
      const { result, confirmed } = await runAcme(async (ctx) => ctxCall(ctx, "batch", items), {
        capabilities: [capability("acme.set-note@1"), capability("acme.set-tag@1")],
      });
      expect(result).toMatchObject({ ok: true, calls: ["acme.set-note@1", "acme.set-tag@1"] });
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0]?.map((write) => write.capability)).toEqual([
        "acme.set-note@1",
        "acme.set-tag@1",
      ]);
      expect(sent).toEqual(["acme.set-note@1", "acme.set-tag@1"]);
    });

    it("refuses an irreversible write in a batch before confirm", async () => {
      const items = [
        { use: "acme.set-note@1", args: { name: "a" } },
        { use: "acme.delete-note@1", args: { name: "a" } },
      ];
      const { result, confirmed } = await runAcme(async (ctx) => ctxCall(ctx, "batch", items), {
        capabilities: [
          acmeCapability("acme.set-note@1"),
          acmeCapability("acme.delete-note@1", { risk: "irreversible" }),
        ],
      });
      expect(result).toMatchObject({
        ok: false,
        reason: "toolscript.irreversible-in-batch",
        calls: [],
      });
      expect(confirmed).toEqual([]);
    });

    it("refuses a read or an unused capability in a batch", async () => {
      for (const use of ["acme.get-note@1", "acme.other@1"]) {
        const { result } = await runAcme(
          async (ctx) => ctxCall(ctx, "batch", [{ use, args: {} }]),
          {
            capabilities: [acmeCapability("acme.get-note@1", { kind: "read" })],
          },
        );
        expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-argument" });
      }
    });
  });

  verifies("toolscript-host.touches", () => {
    const header = { touches: { "acme.set-note@1": { name: "note-{input.names[]}" } } };
    const input = { names: ["a", "b"] };

    it("fills placeholders from the input", () => {
      expect(expandTemplate("note-{input.names[]}", input)).toEqual(["note-a", "note-b"]);
      expect(expandTemplate("{input.missing}", input)).toEqual([]);
    });

    it("confirms a write inside the declared targets", async () => {
      const { result } = await runAcme((ctx) => setNote(ctx, { name: "note-b" }), {
        capabilities: [acmeCapability("acme.set-note@1")],
        header,
        input,
      });
      expect(result).toMatchObject({ ok: true, calls: ["acme.set-note@1"] });
    });

    it("refuses a write outside them, or with no entry, before confirm", async () => {
      const cases = [
        { capability: "acme.set-note@1", args: { name: "note-c" } },
        { capability: "acme.set-tag@1", args: { tag: "a" } },
      ];
      for (const { capability, args } of cases) {
        const { result, confirmed } = await runAcme(
          async (ctx) =>
            ctxCall(ctx, capability === "acme.set-note@1" ? "acme.setNote" : "acme.setTag", args),
          { capabilities: [acmeCapability(capability)], header, input },
        );
        expect(result).toMatchObject({ ok: false, reason: "toolscript.undeclared-target" });
        expect(confirmed).toEqual([]);
      }
    });
  });

  verifies("toolscript-host.preview", () => {
    it("adds the capability's own lines after the header's preview", async () => {
      const card = { component: "card", body: "Sets a note" };
      const capability = acmeCapability("acme.set-note@1", {
        preview: (args) => [`Set note ${(args as Record<string, string>)["name"]}`],
      });
      const { confirmed } = await runAcme((ctx) => setNote(ctx, { name: "b" }), {
        capabilities: [capability],
        header: { ui: { preview: [card] } },
      });
      const [write] = confirmed[0] ?? [];
      expect((write as ToolScriptHostWrite).preview).toEqual({
        fromHeader: [card],
        fromCapability: ["Set note b"],
      });
    });
  });
});
