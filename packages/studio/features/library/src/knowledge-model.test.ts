import type { ItemUsage } from "@halonicjs/app";
import { createToastStore } from "@halonicjs/studio-kit";
import { SaveState } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeHost } from "./knowledge-host.ts";
import { KnowledgeModel } from "./knowledge-model.ts";

const noUsage: ItemUsage = { agents: [], hubs: [], routines: [], collections: [] };
const text = "---\nname: Handbook\ndescription: House rules\n---\n";

function hostOf(read: KnowledgeHost["read"]): KnowledgeHost {
  return {
    read,
    write: async () => {},
    summarize: async () => ({ kind: "no-documents" }),
    usage: async () => noUsage,
    subscribe: () => () => {},
  };
}

verifies("library.knowledge-page", () => {
  describe("KnowledgeModel", () => {
    it("says the first read failed while nothing has loaded, then clears it on the next read", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      let failing = true;
      const model = new KnowledgeModel(
        hostOf(async () => {
          if (failing) throw new Error("locked");
          return { text, source: "Folder docs · 1 document" };
        }),
        { hub: null, id: "handbook" },
      );
      await model.refresh();
      expect(model.state).toMatchObject({ loaded: false, failed: true });
      expect(error).toHaveBeenCalledOnce();
      failing = false;
      await model.refresh();
      expect(model.state).toMatchObject({ loaded: true, failed: false });
      error.mockRestore();
    });

    it("keeps a failed summary save through a save of the lookup mode, with the real save state", async () => {
      const writes: string[] = [];
      let failing = true;
      const host: KnowledgeHost = {
        ...hostOf(async () => ({ text: "name: Handbook\n", source: "Folder docs · 1 document" })),
        write: async (_source, written) => {
          if (failing) throw new Error("disk full");
          writes.push(written);
        },
      };
      const saving = new SaveState(createToastStore());
      const model = new KnowledgeModel(host, { hub: null, id: "handbook" }, (title, write) =>
        saving.save({ key: "knowledge/acme/handbook", title }, write),
      );
      await model.refresh();
      expect(await model.save({ summary: "Our rules." })).toBe(false);
      expect(saving.note).toMatchObject({ kind: "failed" });
      failing = false;
      expect(await model.save({ mode: "auto" })).toBe(true);
      expect(writes).toHaveLength(1);
      expect(writes[0]).toContain("Our rules.");
      expect(writes[0]).toContain("auto");
      expect(saving.note).toEqual({ kind: "saved" });
    });
  });
});
