import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { initWorkspace, loadWorkspace } from "./index.ts";
import { MemoryStore } from "./test/memory-store.ts";

verifies("workspace.init", () => {
  describe("an empty store", () => {
    it("gets a .gitignore and a workspace.yaml with an id made from the name", async () => {
      const store = new MemoryStore();
      const result = await initWorkspace(store, { name: "Acme Billing" });

      expect(result).toEqual({
        ok: true,
        value: {
          location: "memory:acme",
          id: "acme-billing",
          name: "Acme Billing",
          files: [
            { path: ".gitignore", change: "created" },
            { path: "workspace.yaml", change: "created" },
          ],
        },
      });
      expect(store.files.get(".gitignore")).toBe(".env\n.env.*\n");
      expect(store.files.get("workspace.yaml")).toBe("id: acme-billing\nname: Acme Billing\n");
    });

    it("loads with no issue", async () => {
      const store = new MemoryStore();
      await initWorkspace(store, { name: "Acme" });

      const workspace = await loadWorkspace(store);
      expect(workspace.issues).toEqual([]);
      expect(workspace.files.map((file) => file.path)).toEqual(["workspace.yaml"]);
    });

    it("takes the id it is given", async () => {
      const store = new MemoryStore();
      const result = await initWorkspace(store, { name: "Acme Billing", id: "billing" });

      expect(result.ok && result.value.id).toBe("billing");
      expect(store.files.get("workspace.yaml")).toBe("id: billing\nname: Acme Billing\n");
    });
  });

  describe("a .gitignore already there", () => {
    it("keeps its lines and gains the missing ones on a line of their own", async () => {
      const store = new MemoryStore({ ".gitignore": "node_modules/" });
      const result = await initWorkspace(store, { name: "Acme" });

      expect(store.files.get(".gitignore")).toBe("node_modules/\n.env\n.env.*\n");
      expect(result.ok && result.value.files[0]).toEqual({ path: ".gitignore", change: "updated" });
    });

    it("adds only the line that is missing", async () => {
      const store = new MemoryStore({ ".gitignore": "  .env\r\ndist/\r\n" });
      await initWorkspace(store, { name: "Acme" });

      expect(store.files.get(".gitignore")).toBe("  .env\r\ndist/\r\n.env.*\n");
    });

    it("is not written when it lists both lines", async () => {
      const store = new MemoryStore({ ".gitignore": ".env.*\n.env\n" });
      const result = await initWorkspace(store, { name: "Acme" });

      expect(store.written).toEqual(["workspace.yaml"]);
      expect(result.ok && result.value.files).toEqual([
        { path: "workspace.yaml", change: "created" },
      ]);
    });
  });

  describe("writing nothing", () => {
    it("leaves a store that is already a workspace alone", async () => {
      const store = new MemoryStore({ "workspace.yaml": "id: old\nname: Old\n" });
      const result = await initWorkspace(store, { name: "Acme" });

      expect(result).toEqual({
        ok: false,
        error: { kind: "already_a_workspace", location: "memory:acme" },
      });
      expect(store.written).toEqual([]);
    });

    it("refuses an id the workspace kind doesn't allow, naming its key path", async () => {
      const store = new MemoryStore();
      const result = await initWorkspace(store, { name: "Acme", id: "Acme" });

      expect(result.ok).toBe(false);
      if (!result.ok && result.error.kind === "invalid_settings") {
        expect(result.error.problems.map((problem) => problem.path)).toEqual([["id"]]);
      } else {
        expect.fail("expected invalid settings");
      }
      expect(store.written).toEqual([]);
    });
  });

  it("can be repeated after a write fails", async () => {
    const store = new MemoryStore();
    store.failOn = "workspace.yaml";
    await expect(initWorkspace(store, { name: "Acme" })).rejects.toThrow("cannot write");

    store.failOn = null;
    const result = await initWorkspace(store, { name: "Acme" });
    expect(result.ok && result.value.files).toEqual([
      { path: "workspace.yaml", change: "created" },
    ]);
    expect(store.files.get(".gitignore")).toBe(".env\n.env.*\n");
  });
});
