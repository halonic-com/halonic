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
          files: [".gitignore", "workspace.yaml"],
        },
      });
      expect(store.files.get(".gitignore")).toBe(".env\n.env.*\n");
      expect(store.files.get("workspace.yaml")).toBe(
        "id: acme-billing\nname: Acme Billing\nprivacy:\n  localOnly: true\n",
      );
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
      expect(store.files.get("workspace.yaml")).toBe(
        "id: billing\nname: Acme Billing\nprivacy:\n  localOnly: true\n",
      );
    });
  });

  describe("writing nothing", () => {
    it("leaves a store that is already a workspace alone", async () => {
      const store = new MemoryStore({ "workspace.yaml": "id: old\nname: Old\n" });
      const result = await initWorkspace(store, { name: "Acme" });

      expect(result).toEqual({ ok: false, error: { kind: "not_empty", location: "memory:acme" } });
      expect(store.written).toEqual([]);
    });

    it("leaves a store with any other file alone, even only a .gitignore", async () => {
      const store = new MemoryStore({ ".gitignore": "node_modules/\n" });
      const result = await initWorkspace(store, { name: "Acme" });

      expect(result).toEqual({ ok: false, error: { kind: "not_empty", location: "memory:acme" } });
      expect(store.files.get(".gitignore")).toBe("node_modules/\n");
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

  it("leaves the store empty when a write fails, so it can be repeated", async () => {
    const store = new MemoryStore();
    store.failOn = "workspace.yaml";
    await expect(initWorkspace(store, { name: "Acme" })).rejects.toThrow("cannot write");
    expect(store.files.size).toBe(0);

    store.failOn = null;
    const result = await initWorkspace(store, { name: "Acme" });
    expect(result.ok && result.value.files).toEqual([".gitignore", "workspace.yaml"]);
  });

  it("reports the write's own error when removing the .gitignore fails too", async () => {
    const store = new MemoryStore();
    store.failOn = "workspace.yaml";
    store.remove = () => Promise.reject(new Error("cannot remove .gitignore"));

    await expect(initWorkspace(store, { name: "Acme" })).rejects.toThrow(
      "cannot write workspace.yaml",
    );
  });
});
