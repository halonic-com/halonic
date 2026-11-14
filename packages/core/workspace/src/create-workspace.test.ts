import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { createWorkspace, initWorkspace } from "./index.ts";
import { MemoryStore } from "./test/memory-store.ts";

verifies("workspace.create", () => {
  it("writes the same files as initWorkspace into an empty store", async () => {
    const created = new MemoryStore();
    const initialised = new MemoryStore();

    const result = await createWorkspace(created, { name: "Acme" });
    await initWorkspace(initialised, { name: "Acme" });

    expect(result).toEqual({
      ok: true,
      value: {
        location: "memory:acme",
        id: "acme",
        name: "Acme",
        written: [".gitignore", "workspace.yaml"],
        skipped: [],
        amended: [],
      },
    });
    expect(created.files).toEqual(initialised.files);
  });

  it("writes only the file that is missing and leaves a .gitignore that keeps .env out as it is", async () => {
    const store = new MemoryStore({ ".gitignore": ".env\n.env.*\nnode_modules/\n" });
    const result = await createWorkspace(store, { name: "Acme" });

    expect(result.ok && result.value.written).toEqual(["workspace.yaml"]);
    expect(result.ok && result.value.skipped).toEqual([".gitignore"]);
    expect(result.ok && result.value.amended).toEqual([]);
    expect(store.files.get(".gitignore")).toBe(".env\n.env.*\nnode_modules/\n");
  });

  it("adds the .env lines a .gitignore lacks at its end and says it amended it", async () => {
    const store = new MemoryStore({ ".gitignore": "node_modules/" });
    const result = await createWorkspace(store, { name: "Acme" });

    expect(result.ok && result.value.written).toEqual(["workspace.yaml"]);
    expect(result.ok && result.value.skipped).toEqual([]);
    expect(result.ok && result.value.amended).toEqual([".gitignore"]);
    expect(store.files.get(".gitignore")).toBe("node_modules/\n.env\n.env.*\n");
  });

  it("adds only the .env line that is missing, and none when .env* is there", async () => {
    const partial = new MemoryStore({ ".gitignore": ".env\n" });
    await createWorkspace(partial, { name: "Acme" });
    const wide = new MemoryStore({ ".gitignore": ".env*\n" });
    const result = await createWorkspace(wide, { name: "Acme" });

    expect(partial.files.get(".gitignore")).toBe(".env\n.env.*\n");
    expect(wide.files.get(".gitignore")).toBe(".env*\n");
    expect(result.ok && result.value.skipped).toEqual([".gitignore"]);
  });

  it("adds both files beside files that are not part of the template", async () => {
    const store = new MemoryStore({ "notes.txt": "mine\n" });
    const result = await createWorkspace(store, { name: "Acme" });

    expect(result.ok && result.value.skipped).toEqual([]);
    expect(store.files.get("notes.txt")).toBe("mine\n");
    expect(store.files.has("workspace.yaml")).toBe(true);
  });

  it("says already_workspace and writes nothing when a workspace.yaml is there", async () => {
    const store = new MemoryStore({ "workspace.yaml": "id: old\nname: Old\n" });
    const result = await createWorkspace(store, { name: "Acme" });

    expect(result).toEqual({
      ok: false,
      error: { kind: "already_workspace", location: "memory:acme" },
    });
    expect(store.written).toEqual([]);
  });

  it("refuses any file with ifNotEmpty refuse", async () => {
    const store = new MemoryStore({ "notes.txt": "mine\n" });
    const result = await createWorkspace(store, { name: "Acme", ifNotEmpty: "refuse" });

    expect(result).toEqual({ ok: false, error: { kind: "not_empty", location: "memory:acme" } });
    expect(store.written).toEqual([]);
  });

  it("refuses an id the workspace kind doesn't allow, naming its key path", async () => {
    const store = new MemoryStore();
    const result = await createWorkspace(store, { name: "Acme", id: "Acme" });

    expect(
      !result.ok &&
        result.error.kind === "invalid_settings" &&
        result.error.problems.map((p) => p.path),
    ).toEqual([["id"]]);
    expect(store.written).toEqual([]);
  });

  describe("when writing workspace.yaml fails", () => {
    it("removes the .gitignore it wrote", async () => {
      const store = new MemoryStore();
      store.failOn = "workspace.yaml";
      await expect(createWorkspace(store, { name: "Acme" })).rejects.toThrow("cannot write");
      expect(store.files.size).toBe(0);
    });

    it("keeps the .gitignore that was already there", async () => {
      const store = new MemoryStore({ ".gitignore": "node_modules/\n" });
      store.failOn = "workspace.yaml";
      await expect(createWorkspace(store, { name: "Acme" })).rejects.toThrow("cannot write");
      expect([...store.files.keys()]).toEqual([".gitignore"]);
    });

    it("puts back the text of a .gitignore it amended", async () => {
      const store = new MemoryStore({ ".gitignore": "node_modules/\n" });
      store.failOn = "workspace.yaml";
      await expect(createWorkspace(store, { name: "Acme" })).rejects.toThrow("cannot write");
      expect(store.files.get(".gitignore")).toBe("node_modules/\n");
    });
  });
});
