import { createHash } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openWorkspace, workspaceFilesKey } from "./open-workspace.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { ChangedOnDiskError } from "./workspace-files.ts";

const digest = {
  sha256: async (data: Uint8Array) => new Uint8Array(createHash("sha256").update(data).digest()),
};

function open(files: Record<string, string>) {
  const store = new TestDefinitionStore(files, digest);
  const scope = openWorkspace({
    store,
    reviewRecords: new TestDefinitionStore({}),
    digest,
    isTrusted: () => true,
    onListenerError: (error) => {
      throw error;
    },
  });
  const changes: string[] = [];
  scope.events.on("files.changed", ({ label }) => changes.push(label));
  return { store, scope, files: scope.services.get(workspaceFilesKey), changes };
}

/** Holds the next store read of a path until `release` is called. */
function holdNextRead(store: TestDefinitionStore, path: string) {
  const read = store.read.bind(store);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  store.read = async (target: string) => {
    if (target !== path || held) return read(target);
    held = true;
    const text = await read(target);
    await gate;
    return text;
  };
  return { release };
}

verifies("app.workspace-reload-outside", () => {
  it("takes in files changed outside Halonic as one undo step", async () => {
    const { store, files, changes } = open({ "a.yaml": "a", "b.yaml": "b" });
    await files.read("a.yaml");
    await files.read("b.yaml");
    store.files.set("a.yaml", "a2");
    store.files.set("b.yaml", "b2");
    const result = await files.reloadFromOutside(["a.yaml", "b.yaml"]);
    expect(result).toEqual({
      reloaded: [
        { path: "a.yaml", current: "a2" },
        { path: "b.yaml", current: "b2" },
      ],
      held: [],
    });
    expect(files.dirty).toBe(false);
    expect(changes.at(-1)).toBe("Changed outside Halonic");
    expect(await files.read("a.yaml")).toBe("a2");
    expect(files.undo()).toBe(true);
    expect(files.pending).toEqual({ "a.yaml": "a", "b.yaml": "b" });
    expect(files.canUndo).toBe(false);
    expect(await files.save()).toBe(2);
    expect(store.files.get("a.yaml")).toBe("a");
    expect(files.redo()).toBe(true);
    expect(files.pending).toEqual({ "a.yaml": "a2", "b.yaml": "b2" });
  });

  it("saves a file again after it was taken in", async () => {
    const { store, files } = open({ "a.yaml": "a" });
    await files.read("a.yaml");
    store.files.set("a.yaml", "outside");
    await files.reloadFromOutside(["a.yaml"]);
    files.change("Edited", { "a.yaml": "mine" });
    expect(await files.save()).toBe(1);
    expect(store.files.get("a.yaml")).toBe("mine");
  });

  it("holds a file with unsaved changes and leaves out files it never read or that did not change", async () => {
    const { store, files } = open({ "a.yaml": "a", "b.yaml": "b", "c.yaml": "c" });
    await files.read("a.yaml");
    await files.read("b.yaml");
    files.change("Edited", { "a.yaml": "mine" });
    store.files.set("a.yaml", "outside");
    store.files.set("c.yaml", "c2");
    const result = await files.reloadFromOutside(["a.yaml", "b.yaml", "c.yaml"]);
    expect(result).toEqual({ reloaded: [], held: ["a.yaml"] });
    expect(files.pending).toEqual({ "a.yaml": "mine" });
    await expect(files.save()).rejects.toBeInstanceOf(ChangedOnDiskError);
  });

  it("takes in a file deleted outside Halonic, and undo brings its text back", async () => {
    const { store, files } = open({ "a.yaml": "a" });
    await files.read("a.yaml");
    store.files.delete("a.yaml");
    const result = await files.reloadFromOutside(["a.yaml"]);
    expect(result.reloaded).toEqual([{ path: "a.yaml", current: null }]);
    expect(await files.read("a.yaml")).toBeNull();
    files.undo();
    expect(files.pending).toEqual({ "a.yaml": "a" });
    expect(await files.save()).toBe(1);
    expect(store.files.get("a.yaml")).toBe("a");
  });

  it("measures older undo steps against the new text", async () => {
    const { store, files } = open({ "a.yaml": "a", "b.yaml": "b" });
    await files.read("a.yaml");
    await files.read("b.yaml");
    files.change("Edited b", { "b.yaml": "b1" });
    store.files.set("a.yaml", "a2");
    await files.reloadFromOutside(["a.yaml"]);
    files.undo();
    expect(files.pending).toEqual({ "b.yaml": "b1", "a.yaml": "a" });
    files.undo();
    expect(files.pending).toEqual({ "a.yaml": "a" });
  });

  it("waits for a running save, so a file the save is writing is not held", async () => {
    const { store, files } = open({ "a.yaml": "a", "b.yaml": "b" });
    await files.read("a.yaml");
    await files.read("b.yaml");
    files.change("Edited", { "a.yaml": "a2", "b.yaml": "b2" });
    const write = store.write.bind(store);
    let reloaded: Promise<unknown> = Promise.resolve();
    store.write = async (path, text, options) => {
      const result = await write(path, text, options);
      // The watch reports Halonic's own write while the save is still in its loop.
      if (path === "a.yaml") reloaded = files.reloadFromOutside(["a.yaml"]);
      return result;
    };
    expect(await files.save()).toBe(2);
    expect(await reloaded).toEqual({ reloaded: [], held: [] });
    expect(files.dirty).toBe(false);
  });

  it("keeps the text a save wrote while the reload's store read waited", async () => {
    const { store, files, changes } = open({ "a.yaml": "a" });
    await files.read("a.yaml");
    const gate = holdNextRead(store, "a.yaml");
    const reload = files.reloadFromOutside(["a.yaml"]);
    await Promise.resolve();
    files.change("Edited", { "a.yaml": "a2" });
    expect(await files.save()).toBe(1);
    gate.release();
    expect(await reload).toEqual({ reloaded: [], held: [] });
    expect(changes).not.toContain("Changed outside Halonic");
    files.change("Edited again", { "a.yaml": "a3" });
    expect(await files.save()).toBe(1);
    expect(store.files.get("a.yaml")).toBe("a3");
  });
});
