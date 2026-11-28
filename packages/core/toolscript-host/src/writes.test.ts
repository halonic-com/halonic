import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type AcmeContext, acmeCapability, ctxCall, runAcme } from "./acme.test-helper.ts";
import type { ToolScriptHostWrite } from "./capability.ts";
import { expandTemplate } from "./touches.ts";

const setNote = (ctx: AcmeContext, args: unknown) => ctxCall(ctx, "acme.setNote", args);

/** `acme.set-note@1`, recording each name it is sent. */
function recordingNote() {
  const sent: string[] = [];
  const capability = acmeCapability("acme.set-note@1", {
    call: async (args) => {
      sent.push(String((args as { name: string }).name));
      return null;
    },
  });
  return { sent, capability };
}

/** Batch items that set one note per name. */
const noteItems = (...names: string[]) =>
  names.map((name) => ({ use: "acme.set-note@1", args: { name } }));

/** Waits for every call, so the test sees all that was sent, then fails with the first refusal. */
async function settleAll(calls: readonly Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(calls);
  const failed = results.find((result) => result.status === "rejected");
  if (failed !== undefined) throw failed.reason;
}

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

    it("refuses a batch whose items go over the call limit before confirm", async () => {
      const items = [
        { use: "acme.set-note@1", args: { name: "a" } },
        { use: "acme.set-note@1", args: { name: "b" } },
      ];
      const { result, confirmed } = await runAcme(async (ctx) => ctxCall(ctx, "batch", items), {
        capabilities: [acmeCapability("acme.set-note@1")],
        header: { limits: { calls: 1 } },
      });
      expect(result).toMatchObject({ ok: false, reason: "limit.calls", calls: [] });
      expect(confirmed).toEqual([]);
    });

    it("counts a batch's items when single calls follow it, stopping at the call limit", async () => {
      const sent: string[] = [];
      const capability = acmeCapability("acme.set-note@1", {
        call: async (args) => {
          sent.push(String((args as { name: string }).name));
          return null;
        },
      });
      const items = [
        { use: "acme.set-note@1", args: { name: "a" } },
        { use: "acme.set-note@1", args: { name: "b" } },
      ];
      const { result, confirmed } = await runAcme(
        async (ctx) => {
          await ctxCall(ctx, "batch", items);
          await setNote(ctx, { name: "c" });
          await setNote(ctx, { name: "d" });
        },
        { capabilities: [capability], header: { limits: { calls: 3 } } },
      );
      expect(result).toMatchObject({ ok: false, reason: "limit.calls" });
      expect(confirmed).toHaveLength(2);
      expect(sent).toEqual(["a", "b", "c"]);
    });

    it("counts single calls started together after a batch, stopping at the call limit", async () => {
      const { sent, capability } = recordingNote();
      const { result, confirmed } = await runAcme(
        async (ctx) => {
          await ctxCall(ctx, "batch", noteItems("a", "b"));
          await settleAll([setNote(ctx, { name: "c" }), setNote(ctx, { name: "d" })]);
        },
        { capabilities: [capability], header: { limits: { calls: 3 } } },
      );
      expect(result).toMatchObject({ ok: false, reason: "limit.calls" });
      expect(confirmed).toHaveLength(2);
      expect(sent).toEqual(["a", "b", "c"]);
    });

    it("counts batches started together, stopping at the call limit", async () => {
      const { sent, capability } = recordingNote();
      const { result, confirmed } = await runAcme(
        async (ctx) => {
          await settleAll([
            ctxCall(ctx, "batch", noteItems("a", "b")),
            ctxCall(ctx, "batch", noteItems("c", "d")),
          ]);
        },
        { capabilities: [capability], header: { limits: { calls: 3 } } },
      );
      expect(result).toMatchObject({ ok: false, reason: "limit.calls" });
      expect(confirmed).toHaveLength(1);
      expect(sent).toEqual(["a", "b"]);
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

    it("refuses every write in a user run whose header has no touches", async () => {
      const { result, confirmed } = await runAcme((ctx) => setNote(ctx, { name: "note-a" }), {
        capabilities: [acmeCapability("acme.set-note@1")],
        header: { touches: undefined },
      });
      expect(result).toMatchObject({
        ok: false,
        reason: "toolscript.undeclared-target",
        calls: [],
      });
      expect(confirmed).toEqual([]);
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

    it("hands confirm a deep-frozen copy of the header's preview", async () => {
      const card = { component: "card", body: "Sets a note" };
      const { confirmed } = await runAcme((ctx) => setNote(ctx, { name: "b" }), {
        capabilities: [acmeCapability("acme.set-note@1")],
        header: { ui: { preview: [card] } },
      });
      const [write] = confirmed[0] ?? [];
      const fromHeader = (write as ToolScriptHostWrite).preview?.fromHeader ?? [];
      expect(Object.isFrozen(fromHeader)).toBe(true);
      expect(Object.isFrozen(fromHeader[0])).toBe(true);
      expect(fromHeader[0]).not.toBe(card);
    });
  });
});
