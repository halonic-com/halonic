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
  return { store, files: scope.services.get(workspaceFilesKey) };
}

verifies("app.workspace-save-unchanged", () => {
  it("stops and keeps the change unsaved when the file changed outside Halonic", async () => {
    const { store, files } = open({ "a.yaml": "one", "b.yaml": "b" });
    expect(await files.read("a.yaml")).toBe("one");
    store.files.set("a.yaml", "outside");
    files.change("Edited", { "a.yaml": "mine", "b.yaml": "b2" });
    const failure = await files.save().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ChangedOnDiskError);
    expect(failure).toMatchObject({ path: "a.yaml", current: "outside" });
    expect(failure).toMatchObject({ held: [{ path: "a.yaml", current: "outside" }] });
    expect(store.files.get("a.yaml")).toBe("outside");
    // Saving pauses for the held file only.
    expect(store.files.get("b.yaml")).toBe("b2");
    expect(files.pending).toEqual({ "a.yaml": "mine" });
  });

  it("lists every held file and writes the ones after them", async () => {
    const { store, files } = open({ "a.yaml": "a", "b.yaml": "b", "c.yaml": "c", "d.yaml": "d" });
    for (const path of ["a.yaml", "b.yaml", "c.yaml", "d.yaml"]) await files.read(path);
    store.files.set("a.yaml", "outside a");
    store.files.set("c.yaml", "outside c");
    files.change("Edited", { "a.yaml": "1", "b.yaml": "2", "c.yaml": "3", "d.yaml": "4" });
    const failure = await files.save().catch((error: unknown) => error);
    expect(failure).toMatchObject({
      held: [
        { path: "a.yaml", current: "outside a" },
        { path: "c.yaml", current: "outside c" },
      ],
    });
    expect([store.files.get("b.yaml"), store.files.get("d.yaml")]).toEqual(["2", "4"]);
    expect(files.pending).toEqual({ "a.yaml": "1", "c.yaml": "3" });
  });

  it("does not delete a file that changed outside Halonic", async () => {
    const { store, files } = open({ "a.yaml": "one" });
    await files.read("a.yaml");
    store.files.set("a.yaml", "outside");
    files.change("Deleted", { "a.yaml": null });
    await expect(files.save()).rejects.toBeInstanceOf(ChangedOnDiskError);
    expect(store.files.get("a.yaml")).toBe("outside");
  });

  it("does not create a file that appeared outside Halonic", async () => {
    const { store, files } = open({});
    expect(await files.read("n.yaml")).toBeNull();
    store.files.set("n.yaml", "outside");
    files.change("Created", { "n.yaml": "mine" });
    await expect(files.save()).rejects.toMatchObject({ current: "outside" });
    expect(store.files.get("n.yaml")).toBe("outside");
  });

  it("saves again after its own save", async () => {
    const { store, files } = open({ "a.yaml": "one" });
    await files.read("a.yaml");
    files.change("First", { "a.yaml": "two" });
    expect(await files.save()).toBe(1);
    files.change("Second", { "a.yaml": "three" });
    expect(await files.save()).toBe(1);
    expect(store.files.get("a.yaml")).toBe("three");
  });

  it("does not overwrite the outside text when saved a second time", async () => {
    const { store, files } = open({ "a.yaml": "one" });
    await files.read("a.yaml");
    store.files.set("a.yaml", "outside");
    files.change("Edited", { "a.yaml": "mine" });
    await expect(files.save()).rejects.toBeInstanceOf(ChangedOnDiskError);
    await expect(files.save()).rejects.toBeInstanceOf(ChangedOnDiskError);
    expect(store.files.get("a.yaml")).toBe("outside");
    expect(files.pending).toEqual({ "a.yaml": "mine" });
  });

  it("saves after a discard and a fresh read of a file changed outside", async () => {
    const { store, files } = open({ "a.yaml": "one" });
    await files.read("a.yaml");
    store.files.set("a.yaml", "outside");
    files.discard();
    expect(await files.read("a.yaml")).toBe("outside");
    files.change("Edited", { "a.yaml": "mine" });
    expect(await files.save()).toBe(1);
    expect(store.files.get("a.yaml")).toBe("mine");
  });
});
