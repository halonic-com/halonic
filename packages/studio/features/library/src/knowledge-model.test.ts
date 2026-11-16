import type { ItemUsage } from "@halonicjs/app";
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
  });
});
