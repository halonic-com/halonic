import { describe, expect, it } from "vitest";
import { openWorkspace, workspaceFilesKey } from "./open-workspace.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { ModelHistory, modelPaths, randomStep, seededRandom } from "./testing/model-history.ts";

const workflowPath = "hubs/p/workflows/f.workflow.yaml";
const workflow =
  "name: F\ninitial: s\nstates:\n  s: { agent: a, output: out, on: [{ to: end }] }\n  end: { type: final }\n";

function open(files: Record<string, string> = { [workflowPath]: workflow }) {
  const store = new TestDefinitionStore(files);
  const scope = openWorkspace({
    store,
    onListenerError: (error) => {
      throw error;
    },
  });
  const changes: string[] = [];
  scope.events.on("files.changed", ({ label }) => changes.push(label));
  return { store, scope, files: scope.services.get(workspaceFilesKey), changes };
}

describe("app.workspace-undo", () => {
  // Ported from 784f78d studio.test.ts "edits a workflow, validates live, undoes, and saves to files".
  // The workflow model, diagnostics and graph checks of that case move to the workflows feature.
  it("edits a workflow, undoes, redoes, and saves to files", async () => {
    const { store, scope, files } = open();
    const withReview = workflow.replace("  end:", "  review: { type: wait }\n  end:");
    const withExit = withReview.replace(
      "review: { type: wait }",
      "review: { type: wait, on: [{ to: end, event: approve }] }",
    );
    const renamed = withExit.replace("initial: s", "initial: ask").replace("  s: {", "  ask: {");
    files.change("Added state review", { [workflowPath]: withReview });
    files.change("Added a transition", { [workflowPath]: withExit });
    files.change("Renamed state s to ask", { [workflowPath]: renamed });
    expect(await files.read(workflowPath)).toContain("initial: ask");
    expect(await scope.commands.execute("workspace.undo")).toBe(true);
    expect(await files.read(workflowPath)).toBe(withExit);
    expect(await scope.commands.execute("workspace.redo")).toBe(true);
    expect(Object.keys(files.pending)).toEqual([workflowPath]);
    expect(await scope.commands.execute("workspace.save")).toBe(1);
    expect(await store.read(workflowPath)).toContain("initial: ask");
    expect(files.pending).toEqual({});
  });

  it("does nothing on undo or redo without a step", async () => {
    const { scope, files } = open();
    expect(await scope.commands.execute("workspace.undo")).toBe(false);
    expect(await scope.commands.execute("workspace.redo")).toBe(false);
    expect([files.canUndo, files.canRedo, files.dirty]).toEqual([false, false, false]);
  });

  it("makes typing in one file one step", async () => {
    const { files } = open();
    for (const text of ["n", "na", "nam"]) {
      files.change(
        `Edited ${workflowPath}`,
        { [workflowPath]: text },
        { coalesceKey: workflowPath },
      );
    }
    files.undo();
    expect(files.pending).toEqual({});
    expect(files.canUndo).toBe(false);
  });

  it("undoes a saved change to the text from before it, unsaved", async () => {
    const { files } = open({ "a.yaml": "v0" });
    files.change("Edited a", { "a.yaml": "v1" });
    await files.save();
    expect(files.undo()).toBe(true);
    expect(await files.read("a.yaml")).toBe("v0");
    expect(files.pending).toEqual({ "a.yaml": "v0" });
    expect(files.redo()).toBe(true);
    expect(await files.read("a.yaml")).toBe("v1");
    expect(files.dirty).toBe(false);
  });

  it("undoes a saved new file to an unsaved delete", async () => {
    const { files } = open({});
    files.change("Added b", { "b.yaml": "new" });
    await files.save();
    files.undo();
    expect(await files.read("b.yaml")).toBeNull();
    expect(files.pending).toEqual({ "b.yaml": null });
  });

  it("undoes a saved delete to the file again, unsaved", async () => {
    const { files } = open({ "c.yaml": "kept" });
    files.change("Deleted c", { "c.yaml": null });
    await files.save();
    files.undo();
    expect(await files.read("c.yaml")).toBe("kept");
    expect(files.pending).toEqual({ "c.yaml": "kept" });
  });

  it("undoes across several saves, step by step", async () => {
    const { files } = open({ "a.yaml": "v0" });
    files.change("Edited a", { "a.yaml": "v1" });
    files.change("Added b", { "b.yaml": "new" });
    await files.save();
    files.change("Edited a again", { "a.yaml": "v2" });
    await files.save();
    files.undo();
    expect(files.pending).toEqual({ "a.yaml": "v1" });
    files.undo();
    expect(files.pending).toEqual({ "a.yaml": "v1", "b.yaml": null });
    files.undo();
    expect(await files.read("a.yaml")).toBe("v0");
    expect(await files.read("b.yaml")).toBeNull();
    expect(files.canUndo).toBe(false);
  });

  it("matches a simple model over random edits, saves, undos and redos", async () => {
    const random = seededRandom(7);
    for (let round = 0; round < 50; round++) {
      const { files } = open({ "a.yaml": "a0" });
      const model = new ModelHistory({ "a.yaml": "a0", "b.yaml": null, "c.yaml": null });
      for (let step = 0; step < 30; step++) {
        await randomStep(files, model, random);
        for (const path of modelPaths) {
          expect(await files.read(path), `round ${round} step ${step} ${path}`).toBe(
            model.view[path],
          );
        }
      }
    }
  });

  it("reports every change with its label", () => {
    const { files, changes } = open();
    files.change("Added an agent", { "a.yaml": "x" });
    files.undo();
    files.redo();
    files.discard();
    expect(changes).toEqual(["Added an agent", "Undone", "Redone", "Unsaved changes discarded"]);
    expect([files.dirty, files.canUndo]).toEqual([false, false]);
  });
});

describe("app.workspace-save", () => {
  // Ported from 784f78d studio.test.ts "creates agents as files and runs workflow tests as test runs".
  // Running workflow tests moves to the workflows feature with the engine.
  it("creates an agent as a file, edits it and saves it", async () => {
    const { store, files } = open();
    const path = "hubs/p/agents/code-reviewer.agent.yaml";
    files.change("Created agent Code Reviewer", { [path]: "name: Code Reviewer\n" });
    files.change("Updated agent Code Reviewer", {
      [path]: "name: Code Reviewer\ninstructions: Review code.\n",
    });
    await files.save();
    expect(await store.read(path)).toContain("Review code.");
  });

  it("reads unsaved text first, then the store", async () => {
    const { files } = open({ "a.yaml": "saved" });
    expect(await files.read("a.yaml")).toBe("saved");
    files.change("Deleted a.yaml", { "a.yaml": null });
    expect(await files.read("a.yaml")).toBeNull();
    expect(await files.read("missing.yaml")).toBeNull();
  });

  it("deletes files marked for deletion and writes in the order they were changed", async () => {
    const { store, scope, files } = open({ "old.yaml": "x" });
    files.change("Added b", { "b.yaml": "b" });
    files.change("Deleted old", { "old.yaml": null });
    files.change("Changed b", { "b.yaml": "bb" });
    const saved: string[][] = [];
    scope.events.on("files.saved", ({ paths }) => saved.push(paths));
    expect(await files.save()).toBe(2);
    expect(store.log).toEqual(["write b.yaml", "remove old.yaml"]);
    expect(await store.read("old.yaml")).toBeNull();
    expect(saved).toEqual([["b.yaml", "old.yaml"]]);
  });

  it("keeps every change unsaved when a write fails", async () => {
    const { store, files } = open();
    files.change("Changed two files", { "a.yaml": "a", "b.yaml": "b" });
    store.failOn = "b.yaml";
    await expect(files.save()).rejects.toThrow("cannot write b.yaml");
    expect(files.pending).toEqual({ "a.yaml": "a", "b.yaml": "b" });
    store.failOn = null;
    await files.save();
    expect(files.pending).toEqual({});
  });

  it("still undoes a file that was written before a write failed", async () => {
    const { store, files } = open({ "a.yaml": "v0" });
    files.change("Changed two files", { "a.yaml": "v1", "b.yaml": "b" });
    store.failOn = "b.yaml";
    await expect(files.save()).rejects.toThrow("cannot write b.yaml");
    files.undo();
    expect(await files.read("a.yaml")).toBe("v0");
    expect(await files.read("b.yaml")).toBeNull();
  });

  it("lets a second save wait for the first, then save what is left", async () => {
    const { store, scope, files } = open({});
    const saved: string[][] = [];
    scope.events.on("files.saved", ({ paths }) => saved.push(paths));
    files.change("First", { "a.yaml": "one" });
    const first = files.save();
    files.change("Second", { "b.yaml": "two" });
    const second = files.save();
    expect(await Promise.all([first, second])).toEqual([1, 1]);
    expect(store.log).toEqual(["write a.yaml", "write b.yaml"]);
    expect(saved).toEqual([["a.yaml"], ["b.yaml"]]);
    expect(files.dirty).toBe(false);
  });

  it("does nothing when there is nothing to save", async () => {
    const { store, scope, files, changes } = open();
    let saves = 0;
    scope.events.on("files.saved", () => saves++);
    expect(await files.save()).toBe(0);
    expect([store.log, changes, saves]).toEqual([[], [], 0]);
  });

  it("keeps a change made while the save runs", async () => {
    const { files } = open();
    files.change("First", { "a.yaml": "one" });
    const saving = files.save();
    files.change("Second", { "a.yaml": "two" });
    await saving;
    expect(files.pending).toEqual({ "a.yaml": "two" });
  });

  it("lets a discard during a save win, so the next save writes nothing", async () => {
    const { store, files } = open({ "a.yaml": "old" });
    files.change("Changed", { "a.yaml": "new" });
    const saving = files.save();
    files.discard();
    await saving;
    expect(files.pending).toEqual({});
    expect(files.canUndo).toBe(false);
    expect(await files.save()).toBe(0);
    expect(store.files.get("a.yaml")).toBe("new");
  });

  it("keeps the undo history after a save", async () => {
    const { files } = open();
    files.change("Changed", { "a.yaml": "a" });
    await files.save();
    expect(files.canUndo).toBe(true);
    expect(files.undo()).toBe(true);
    // a.yaml didn't exist before the change, so undoing it is an unsaved delete.
    expect(files.pending).toEqual({ "a.yaml": null });
    expect(await files.read("a.yaml")).toBeNull();
  });
});
