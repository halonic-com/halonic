import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { paperclipRequests } from "./requests.ts";
import { everyRow } from "./shadow-data.test-helper.ts";

verifies("paperclip-client.shadow-reads", () => {
  // G2.3: Studio's client has no way to change what the never-list check reads.
  describe("the fixed list and the pinned documents", () => {
    const pinnedKeys = ["never-list", "auto-approve-stop"];

    it("names a literal key on every write to a document, never a pinned one", () => {
      const documentWrites = everyRow().filter(
        ([, method, path]) => method !== "GET" && path.includes("/documents"),
      );
      for (const [name] of documentWrites) {
        const path = paperclipRequests[name].path;
        const key = path.split("/documents/")[1]?.split("/")[0] ?? "";
        expect(key, name).toMatch(/^[a-z][a-z-]*$/);
        expect(pinnedKeys, name).not.toContain(key);
      }
    });

    it("reads the pinned documents only with GET", () => {
      for (const [name, row] of Object.entries(paperclipRequests)) {
        if (pinnedKeys.some((key) => row.path.includes(`/documents/${key}`))) {
          expect(row.method, name).toBe("GET");
        }
      }
    });

    it("has no row that locks, unlocks or deletes a document", () => {
      for (const [name, row] of Object.entries(paperclipRequests)) {
        expect(row.method, name).not.toBe("DELETE");
        expect(row.path, name).not.toMatch(/\/(lock|unlock)$/);
        if (row.path.includes("/documents")) expect(row.path, name).not.toMatch(/delete/);
      }
    });
  });
});
