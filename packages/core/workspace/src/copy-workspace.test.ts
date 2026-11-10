import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { copyWorkspace, loadWorkspace } from "./index.ts";
import { MemorySource } from "./test/memory-source.ts";
import { MemoryStore } from "./test/memory-store.ts";

/** A small workspace with one agent, as a source to copy. */
const source = (extra: Record<string, string> = {}) =>
  new MemorySource({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/agents/sorter.agent.yaml":
      "id: sorter\nname: Sorter\nmodel: test\ninstructions: Sort it.\n",
    ...extra,
  });

verifies("workspace.copy", () => {
  describe("an empty target", () => {
    it("gets every file, a .gitignore first and workspace.yaml last", async () => {
      const target = new MemoryStore();
      const result = await copyWorkspace(source(), target);

      expect(result).toEqual({
        ok: true,
        value: {
          location: "memory:acme",
          files: [
            ".gitignore",
            "hubs/support/agents/sorter.agent.yaml",
            "hubs/support/hub.yaml",
            "workspace.yaml",
          ],
        },
      });
      expect(target.written).toEqual(result.ok ? result.value.files : []);
      expect(target.files.get(".gitignore")).toBe(".env\n.env.*\n");
      expect(target.files.get("workspace.yaml")).toBe("id: acme\nname: Acme\n");
    });

    it("loads as the source does", async () => {
      const target = new MemoryStore();
      await copyWorkspace(source(), target);

      const copied = await loadWorkspace(target);
      const original = await loadWorkspace(source());
      expect(copied.issues).toEqual(original.issues);
      expect(copied.files.map((file) => file.path)).toEqual(
        original.files.map((file) => file.path),
      );
    });

    it("keeps the source's own .gitignore", async () => {
      const target = new MemoryStore();
      await copyWorkspace(source({ ".gitignore": ".env\nnode_modules/\n" }), target);

      expect(target.files.get(".gitignore")).toBe(".env\nnode_modules/\n");
      expect(target.written[0]).toBe(".gitignore");
    });

    it("leaves out a file the source lists but can no longer read", async () => {
      const target = new MemoryStore();
      const vanishing = new MemorySource({ "workspace.yaml": "id: acme\nname: Acme\n" }, [
        "notes.md",
      ]);
      const result = await copyWorkspace(vanishing, target);

      expect(result.ok && result.value.files).toEqual([".gitignore", "workspace.yaml"]);
    });
  });

  it("leaves a target with any file alone", async () => {
    const target = new MemoryStore({ "notes.txt": "Mine.\n" });
    const result = await copyWorkspace(source(), target);

    expect(result).toEqual({ ok: false, error: { kind: "not_empty", location: "memory:acme" } });
    expect(target.written).toEqual([]);
    expect([...target.files.keys()]).toEqual(["notes.txt"]);
  });

  it("leaves the target empty when a write fails, so it can be repeated", async () => {
    const target = new MemoryStore();
    target.failOn = "workspace.yaml";
    await expect(copyWorkspace(source(), target)).rejects.toThrow("cannot write workspace.yaml");
    expect(target.files.size).toBe(0);

    target.failOn = null;
    const result = await copyWorkspace(source(), target);
    expect(result.ok && result.value.files).toHaveLength(4);
  });
});
