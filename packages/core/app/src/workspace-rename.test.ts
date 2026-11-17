import { createHash } from "node:crypto";
import type { RemoveOptions, RemoveResult, WriteOptions, WriteResult } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openWorkspace, workspaceFilesKey } from "./open-workspace.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestTrash } from "./testing/test-trash.ts";
import { ChangedOnDiskError } from "./workspace-files.ts";
import { RenameRefusedError } from "./workspace-rename.ts";

const workflowPath = "hubs/p/workflows/f.workflow.yaml";
const workflow =
  "name: F\ninitial: s\nstates:\n  s: { agent: a, output: out, on: [{ to: end }] }\n  end: { type: final }\n";

const digest = {
  sha256: async (data: Uint8Array) => new Uint8Array(createHash("sha256").update(data).digest()),
};

/** A store on a disk that ignores case, like macOS and Windows: `A.yaml` and `a.yaml` are one file, which keeps the name it was made with. */
class CaseInsensitiveStore extends TestDefinitionStore {
  private named(path: string): string {
    return [...this.files.keys()].find((k) => k.toLowerCase() === path.toLowerCase()) ?? path;
  }
  override async read(path: string): Promise<string | null> {
    return await super.read(this.named(path));
  }
  override async write(
    path: string,
    content: string,
    options?: WriteOptions,
  ): Promise<WriteResult> {
    return await super.write(this.named(path), content, options);
  }
  override async remove(path: string, options?: RemoveOptions): Promise<RemoveResult> {
    return await super.remove(this.named(path), options);
  }
}

verifies("app.workspace-rename", () => {
  const other = "hubs/p/workflows/g.workflow.yaml";

  function openWithTrash(
    files: Record<string, string>,
    makeStore: typeof TestDefinitionStore = TestDefinitionStore,
  ) {
    const store = new makeStore(files, digest);
    const trash = new TestTrash(store, digest);
    const scope = openWorkspace({
      store,
      trash,
      reviewRecords: new TestDefinitionStore({}),
      digest,
      isTrusted: () => true,
      onListenerError: (error) => {
        throw error;
      },
    });
    return { store, trash, files: scope.services.get(workspaceFilesKey) };
  }

  it("moves the text, applies the rewrites and undoes as one step", async () => {
    const { files } = openWithTrash({ [workflowPath]: workflow, [other]: "uses: f\n" });
    await files.rename(workflowPath, "hubs/p/workflows/h.workflow.yaml", { [other]: "uses: h\n" });
    expect(await files.read("hubs/p/workflows/h.workflow.yaml")).toBe(workflow);
    expect(await files.read(workflowPath)).toBeNull();
    expect(await files.read(other)).toBe("uses: h\n");
    expect(files.undo()).toBe(true);
    expect(files.pending).toEqual({});
    expect(await files.read(workflowPath)).toBe(workflow);
    expect(await files.read(other)).toBe("uses: f\n");
  });

  it("keeps unsaved text, and for a file never saved leaves nothing to delete", async () => {
    const { files } = openWithTrash({});
    files.change("New file", { "a.yaml": "x: 1\n" });
    await files.rename("a.yaml", "b.yaml");
    expect(files.pending).toEqual({ "b.yaml": "x: 1\n" });
  });

  it("removes the old file without the trash when saved", async () => {
    const { store, trash, files } = openWithTrash({ [workflowPath]: workflow });
    await files.rename(workflowPath, "hubs/p/workflows/h.workflow.yaml");
    expect(await files.save()).toBe(2);
    expect(await store.read(workflowPath)).toBeNull();
    expect(await store.read("hubs/p/workflows/h.workflow.yaml")).toBe(workflow);
    expect(trash.entries.size).toBe(0);
  });

  it("sends the old file to the trash when the new file is held because it changed outside", async () => {
    const { store, trash, files } = openWithTrash({ [workflowPath]: workflow });
    const target = "hubs/p/workflows/h.workflow.yaml";
    await files.read(target);
    await files.rename(workflowPath, target);
    await store.write(target, "outside: 1\n");
    await expect(files.save()).rejects.toBeInstanceOf(ChangedOnDiskError);
    expect(await store.read(target)).toBe("outside: 1\n");
    expect(await store.read(workflowPath)).toBeNull();
    expect([...trash.entries.values()]).toEqual([{ path: workflowPath, content: workflow }]);
  });

  it("still sends a plain delete of the same path to the trash after an undone rename", async () => {
    const { trash, files } = openWithTrash({ [workflowPath]: workflow });
    await files.rename(workflowPath, "hubs/p/workflows/h.workflow.yaml");
    files.undo();
    files.change("Deleted f", { [workflowPath]: null });
    await files.save();
    expect([...trash.entries.values()]).toEqual([{ path: workflowPath, content: workflow }]);
  });

  it("undoes and redoes across a save", async () => {
    const { store, files } = openWithTrash({ [workflowPath]: workflow, [other]: "uses: f\n" });
    const target = "hubs/p/workflows/h.workflow.yaml";
    await files.rename(workflowPath, target, { [other]: "uses: h\n" });
    await files.save();
    expect(files.undo()).toBe(true);
    await files.save();
    expect(await store.read(workflowPath)).toBe(workflow);
    expect(await store.read(target)).toBeNull();
    expect(await store.read(other)).toBe("uses: f\n");
    expect(files.redo()).toBe(true);
    await files.save();
    expect(await store.read(workflowPath)).toBeNull();
    expect(await store.read(target)).toBe(workflow);
    expect(await store.read(other)).toBe("uses: h\n");
  });

  it("refuses a target that exists on disk or as an unsaved new file", async () => {
    const { files } = openWithTrash({ [workflowPath]: workflow, [other]: "g\n" });
    await expect(files.rename(workflowPath, other)).rejects.toBeInstanceOf(RenameRefusedError);
    files.change("New file", { "n.yaml": "n\n" });
    await expect(files.rename(workflowPath, "n.yaml")).rejects.toBeInstanceOf(RenameRefusedError);
    files.change("Deleted g", { [other]: null });
    await expect(files.rename(workflowPath, other)).rejects.toBeInstanceOf(RenameRefusedError);
    expect(Object.keys(files.pending)).toEqual(["n.yaml", other]);
  });

  it("refuses a file that is missing or already marked for deletion", async () => {
    const { files } = openWithTrash({ [workflowPath]: workflow });
    await expect(files.rename("nope.yaml", "x.yaml")).rejects.toBeInstanceOf(RenameRefusedError);
    files.change("Deleted f", { [workflowPath]: null });
    await expect(files.rename(workflowPath, "x.yaml")).rejects.toBeInstanceOf(RenameRefusedError);
    expect(files.pending).toEqual({ [workflowPath]: null });
  });

  it("sends the old file to the trash when the new path was saved with other text", async () => {
    const { store, trash, files } = openWithTrash({ [workflowPath]: workflow });
    await files.rename(workflowPath, "c.yaml");
    files.undo();
    files.change("Edit c", { "c.yaml": "unrelated\n" });
    files.change("Deleted f", { [workflowPath]: null });
    await files.save();
    expect(await store.read(workflowPath)).toBeNull();
    expect([...trash.entries.values()]).toEqual([{ path: workflowPath, content: workflow }]);
  });

  it("keeps an edit made while the rename waits for the store", async () => {
    const { files } = openWithTrash({ [workflowPath]: workflow });
    const renaming = files.rename(workflowPath, "c.yaml");
    files.change("Edit x", { "x.yaml": "x2\n" });
    await renaming;
    expect(files.pending).toEqual({ "c.yaml": workflow, [workflowPath]: null, "x.yaml": "x2\n" });
    expect(files.undo()).toBe(true);
    expect(files.pending).toEqual({ "x.yaml": "x2\n" });
  });

  it("keeps the original out of the trash when a file is renamed twice before a save", async () => {
    const { store, trash, files } = openWithTrash({ [workflowPath]: workflow });
    await files.rename(workflowPath, "b.yaml");
    await files.rename("b.yaml", "c.yaml");
    expect(await files.save()).toBe(2);
    expect(await store.read(workflowPath)).toBeNull();
    expect(await store.read("c.yaml")).toBe(workflow);
    expect(trash.entries.size).toBe(0);
  });

  it("renames a file to the same name in another case on a disk that ignores case", async () => {
    const { store, trash, files } = openWithTrash({ "a.yaml": "x: 1\n" }, CaseInsensitiveStore);
    await files.rename("a.yaml", "A.yaml");
    expect(files.pending).toEqual({ "A.yaml": "x: 1\n", "a.yaml": null });
    expect(await files.save()).toBe(2);
    expect([...store.files]).toEqual([["A.yaml", "x: 1\n"]]);
    expect(trash.entries.size).toBe(0);
  });

  it("saves a rename next to a write in another case of the old name on a disk that ignores case", async () => {
    const { store, files } = openWithTrash({ "a.yaml": "x: 1\n" }, CaseInsensitiveStore);
    await files.rename("a.yaml", "b.yaml");
    files.change("Make A", { "A.yaml": "y: 2\n" });
    expect(await files.save()).toBe(3);
    expect([...store.files].sort()).toEqual([
      ["A.yaml", "y: 2\n"],
      ["b.yaml", "x: 1\n"],
    ]);
  });

  it("refuses a name in another case that is a different file on a disk that tells them apart", async () => {
    const { files } = openWithTrash({ "a.yaml": "x: 1\n", "A.yaml": "x: 1\n" });
    await expect(files.rename("a.yaml", "A.yaml")).rejects.toBeInstanceOf(RenameRefusedError);
    expect(files.pending).toEqual({});
  });

  it("sends a plain delete to the trash after a save that committed the rename", async () => {
    const { store, trash, files } = openWithTrash({ [workflowPath]: workflow });
    await files.rename(workflowPath, "c.yaml");
    await files.save();
    // The file is made again, then deleted in the same save that writes the rename's text to c.
    files.change("New f", { [workflowPath]: "again\n" });
    await files.save();
    files.change("Delete f", { [workflowPath]: null, "c.yaml": workflow });
    await files.save();
    expect(await store.read(workflowPath)).toBeNull();
    expect([...trash.entries.values()]).toEqual([{ path: workflowPath, content: "again\n" }]);
  });
});
