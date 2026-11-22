import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { deleteWithUndo, type UndoableDeleteFiles } from "./undoable-delete.ts";

/** Files in memory with the workspace's undo: every change and undo moves `step` on. */
function memoryFiles(start: Record<string, string>) {
  const store: Record<string, string> = { ...start };
  const labels: string[] = [];
  // What each change replaced, newest last, for the undo.
  const undoable: Record<string, string | undefined>[] = [];
  let step = 0;
  const put = (made: Record<string, string | null | undefined>) => {
    for (const [path, text] of Object.entries(made)) {
      if (text === null || text === undefined) delete store[path];
      else store[path] = text;
    }
  };
  const files: UndoableDeleteFiles = {
    read: async (path) => store[path] ?? null,
    change: (label, made) => {
      labels.push(label);
      undoable.push(Object.fromEntries(Object.keys(made).map((path) => [path, store[path]])));
      step += 1;
      put(made);
    },
    undo: () => {
      const before = undoable.pop();
      if (before === undefined) return false;
      step += 1;
      put(before);
      return true;
    },
    get step() {
      return step;
    },
  };
  return { store, labels, files };
}

const notes = { paths: ["notes.md"], what: "notes.md" } as const;

verifies("studio.undoable-delete", () => {
  it("takes the delete back with the workspace's undo while it is the newest change", async () => {
    const { store, labels, files } = memoryFiles({ "notes.md": "# Notes\n" });

    const deleted = await deleteWithUndo(files, notes);
    expect(store["notes.md"]).toBeUndefined();
    await deleted.undo();

    expect(store["notes.md"]).toBe("# Notes\n");
    expect(labels).toEqual(["Deleted notes.md"]);
  });

  it("writes the files back after another change, and keeps that change", async () => {
    const { store, labels, files } = memoryFiles({ "notes.md": "# Notes\n", "todo.md": "- a\n" });

    const deleted = await deleteWithUndo(files, notes);
    files.change("Changed todo.md", { "todo.md": "- b\n" });
    await deleted.undo();

    expect(store).toEqual({ "notes.md": "# Notes\n", "todo.md": "- b\n" });
    expect(labels).toEqual(["Deleted notes.md", "Changed todo.md", "Put back notes.md"]);
  });

  it("does nothing when the files are back already", async () => {
    const { store, labels, files } = memoryFiles({ "notes.md": "# Notes\n" });

    const deleted = await deleteWithUndo(files, notes);
    files.undo();
    await deleted.undo();

    expect(store["notes.md"]).toBe("# Notes\n");
    expect(labels).toEqual(["Deleted notes.md"]);
  });

  it("writes back only the missing files when some are back with their old text", async () => {
    const { store, labels, files } = memoryFiles({ "a/agent.md": "# A\n", "a/tools.md": "- x\n" });
    const agent = { paths: ["a/agent.md", "a/tools.md"], what: "agent A" } as const;

    const deleted = await deleteWithUndo(files, agent);
    files.change("Created a/agent.md", { "a/agent.md": "# A\n" });
    await deleted.undo();

    expect(store).toEqual({ "a/agent.md": "# A\n", "a/tools.md": "- x\n" });
    expect(labels).toEqual(["Deleted agent A", "Created a/agent.md", "Put back agent A"]);
    await files.undo();
    expect(store).toEqual({ "a/agent.md": "# A\n" });
  });

  it("refuses, names the new file and writes nothing when a file took their place", async () => {
    const { store, labels, files } = memoryFiles({ "notes.md": "# Notes\n" });

    const deleted = await deleteWithUndo(files, notes);
    files.change("Created notes.md", { "notes.md": "# New\n" });

    await expect(deleted.undo()).rejects.toMatchObject({
      kind: "conflict",
      message: "There's a new notes.md in its place. Rename or move the new one, then undo again.",
    });
    expect(store["notes.md"]).toBe("# New\n");
    expect(labels).toEqual(["Deleted notes.md", "Created notes.md"]);
  });
});
