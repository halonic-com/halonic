import { createHash } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openWorkspace, workspaceFilesKey } from "./open-workspace.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestTrash } from "./testing/test-trash.ts";
import { RenameRefusedError } from "./workspace-rename.ts";

const workflowPath = "hubs/p/workflows/f.workflow.yaml";
const workflow =
  "name: F\ninitial: s\nstates:\n  s: { agent: a, output: out, on: [{ to: end }] }\n  end: { type: final }\n";

const digest = {
  sha256: async (data: Uint8Array) => new Uint8Array(createHash("sha256").update(data).digest()),
};

verifies("app.workspace-rename", () => {
  const other = "hubs/p/workflows/g.workflow.yaml";

  function openWithTrash(files: Record<string, string>) {
    const store = new TestDefinitionStore(files, digest);
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
});
