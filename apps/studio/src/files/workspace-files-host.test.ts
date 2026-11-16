import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceFilesHost } from "./workspace-files-host.ts";

function setup(
  saved: string[] | Error,
  pending: Record<string, string | null> = {},
  more: Record<string, string> = {},
  outside: { held?: string[]; theirs?: string | null } = {},
) {
  const watching: {
    changed?: (changes: { path: string; kind: "changed" | "removed" }[]) => void;
    closed: number;
  } = { closed: 0 };
  const settled: string[] = [];
  const renames: { from: string; to: string; rewrites?: Record<string, string> }[] = [];
  const texts: Record<string, string> = { "workspace.yaml": "id: acme\nname: Acme\n", ...more };
  const listeners = new Set<() => void>();
  const changes: { label: string; changes: Record<string, string | null>; key?: string }[] = [];
  let current = pending;
  const undone: number[] = [];
  const host = new WorkspaceFilesHost({
    store: {
      list: async () => {
        if (saved instanceof Error) throw saved;
        return saved;
      },
      watch: async (listener) => {
        watching.changed = listener.changed;
        return {
          close: async () => {
            watching.closed++;
          },
        };
      },
    },
    files: {
      get pending() {
        return current;
      },
      undo: () => {
        undone.push(1);
        return true;
      },
      reloadFromOutside: async () => ({ held: outside.held ?? [] }),
      compare: async (path) => ({
        path,
        mine: "mine",
        theirs: outside.theirs === undefined ? "theirs" : outside.theirs,
        combined: null,
      }),
      rename: async (from, to, rewrites) => {
        renames.push({ from, to, ...(rewrites ? { rewrites } : {}) });
      },
      settle: async (path) => {
        settled.push(path);
      },
      read: async (path) => (path in pending ? (pending[path] ?? null) : (texts[path] ?? null)),
      list: async (dir) => Object.keys(texts).filter((path) => path.startsWith(`${dir}/`)),
      change: (label, made, options) => {
        current = { ...current };
        changes.push({
          label,
          changes: made,
          ...(options?.coalesceKey ? { key: options.coalesceKey } : {}),
        });
      },
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return { host, listeners, changes, watching, settled, renames, undone };
}

verifies("studio.workspace-files-host", () => {
  it("lists saved files and an unsaved new file together", async () => {
    const { host } = setup(["workspace.yaml", "hubs/p/hub.yaml"], { "notes.md": "hi" });

    const listing = await host.list();

    expect(listing.paths).toEqual(["hubs/p/hub.yaml", "notes.md", "workspace.yaml"]);
    expect(listing.marks.size).toBe(0);
  });

  it("leaves out an unsaved delete", async () => {
    const { host } = setup(["workspace.yaml", "a.md"], { "workspace.yaml": null });

    expect((await host.list()).paths).toEqual(["a.md"]);
  });

  it("tells a subscriber of a change, and not after it unsubscribes", () => {
    const { host, listeners } = setup([]);
    let told = 0;

    const stop = host.subscribe(() => told++);
    for (const listener of listeners) listener();
    stop();

    expect(told).toBe(1);
    expect(listeners.size).toBe(0);
  });

  it("rejects an unreadable folder with a one-sentence reason", async () => {
    const { host } = setup(new Error("The folder hubs can't be read"));

    await expect(host.list()).rejects.toThrow("The folder hubs can't be read.");
  });

  it("reads a file with its unsaved text, and null when it has none", async () => {
    const { host } = setup([], { "a.md": "unsaved" });

    expect(await host.read("a.md")).toBe("unsaved");
    expect(await host.read("b.md")).toBeNull();
  });

  it("records an edit as one undo step per file", () => {
    const { host, changes } = setup([]);

    host.edit("a.md", "hello");

    expect(changes).toEqual([{ label: "Edited a.md", changes: { "a.md": "hello" }, key: "a.md" }]);
  });

  it("reports a file's errors by path and counts them in the listing's marks", async () => {
    const { host } = setup(["hubs/p/hub.yaml"], {}, { "hubs/p/hub.yaml": "id: [unclosed\n" });

    const problems = await host.problems();
    const listing = await host.list();

    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatchObject({ file: "hubs/p/hub.yaml", severity: "error" });
    expect(problems[0]?.line).toBeGreaterThan(0);
    expect(listing.marks.get("hubs/p/hub.yaml")?.errors).toBeGreaterThan(0);
  });

  it("reports no problems for a workspace without any", async () => {
    const { host } = setup(["notes.md"], { "notes.md": "hi" });

    expect(await host.problems()).toEqual([]);
  });

  it("marks a file with unsaved changes that changed outside, and tells a subscriber", async () => {
    const { host, watching } = setup(["a.md"], { "a.md": "mine" }, {}, { held: ["a.md"] });
    let told = 0;
    host.subscribe(() => told++);

    watching.changed?.([{ path: "a.md", kind: "changed" }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.outside().get("a.md")).toBe("changed");
    expect((await host.list()).marks.get("a.md")?.outside).toBe(true);
    expect(told).toBe(1);
  });

  it("holds a file that is gone from the folder as deleted", async () => {
    const { host, watching } = setup(
      ["a.md"],
      { "a.md": "mine" },
      {},
      { held: ["a.md"], theirs: null },
    );

    watching.changed?.([{ path: "a.md", kind: "removed" }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.outside().get("a.md")).toBe("deleted");
  });

  it("stops holding a file once the user settles it", async () => {
    const { host, watching, settled } = setup(["a.md"], { "a.md": "mine" }, {}, { held: ["a.md"] });
    watching.changed?.([{ path: "a.md", kind: "changed" }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    let told = 0;
    host.subscribe(() => told++);

    await host.settle("a.md", "use-other");

    expect(settled).toEqual(["a.md"]);
    expect(host.outside().size).toBe(0);
    expect(told).toBe(1);
  });

  it("closes the watch when disposed", async () => {
    const { host, watching } = setup([]);

    await host.dispose();
    await host.dispose();

    expect(watching.closed).toBe(1);
  });
});

verifies("studio.workspace-files-create", () => {
  it("creates an empty file as one undo step and refuses a path that has a file", async () => {
    const { host, changes } = setup(["workspace.yaml"]);

    await host.create("hubs/p/agents/b.agent.yaml");
    await expect(host.create("workspace.yaml")).rejects.toThrow("workspace.yaml already exists.");

    expect(changes).toEqual([
      {
        label: "New file hubs/p/agents/b.agent.yaml",
        changes: { "hubs/p/agents/b.agent.yaml": "" },
      },
    ]);
  });

  it("refuses a path that is a folder, or has a file on the way", async () => {
    const { host, changes } = setup(["workspace.yaml"], {}, { "hubs/p/agents/a.agent.yaml": "x" });

    await expect(host.create("hubs/p/agents")).rejects.toThrow("hubs/p/agents is a folder.");
    await expect(host.create("workspace.yaml/x.yaml")).rejects.toThrow(
      "workspace.yaml is a file, not a folder.",
    );

    expect(changes).toEqual([]);
  });

  it("refuses a path the workspace doesn't serve in plain words", async () => {
    const { host, changes } = setup(["workspace.yaml"]);

    await expect(host.create("hubs//x.yaml")).rejects.toThrow(
      "Files must stay inside the workspace.",
    );
    await expect(host.create(".git/config")).rejects.toThrow(
      '".git/config" is not part of the workspace definitions',
    );

    expect(changes).toEqual([]);
  });
});

verifies("studio.workspace-files-rename", () => {
  const skill = "hubs/support/library/skills/refunds/SKILL.md";
  const agent = "hubs/support/agents/helper.agent.yaml";
  const workspace = {
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    [skill]: "---\nname: Refunds\ndescription: Use for refunds\n---\nBe kind.\n",
    [agent]: "id: helper\nname: Helper\n# the list\nskills: [refunds]\nmodel: test\n",
  };

  it("rewrites the places that name a Library item whose id the new name changes", async () => {
    const { host, renames } = setup([], {}, workspace);
    const to = "hubs/support/library/skills/returns/SKILL.md";

    expect(await host.renameImpact(skill, to)).toBe(1);
    await host.rename(skill, to);

    expect(renames).toEqual([
      {
        from: skill,
        to,
        rewrites: {
          [agent]: "id: helper\nname: Helper\n# the list\nskills: [returns]\nmodel: test\n",
        },
      },
    ]);
  });

  it("changes no other file for a file that is not a Library item or a move that keeps the id", async () => {
    const { host, renames } = setup([], {}, { ...workspace, "notes.md": "hi" });

    expect(await host.renameImpact("notes.md", "todo.md")).toBe(0);
    expect(await host.renameImpact(skill, "hubs/support/library/skills/refunds/other.md")).toBe(0);
    await host.rename("notes.md", "todo.md");

    expect(renames).toEqual([{ from: "notes.md", to: "todo.md", rewrites: {} }]);
  });

  it("refuses a path that has a file and the file's own path", async () => {
    const { host, renames } = setup([], {}, { ...workspace, "notes.md": "hi" });

    await expect(host.rename("notes.md", "workspace.yaml")).rejects.toThrow(
      "workspace.yaml already exists.",
    );
    await expect(host.rename("notes.md", "notes.md")).rejects.toThrow(
      "notes.md already has that name.",
    );
    expect(renames).toEqual([]);
  });

  const collection = "library/collections/claims.collection.yaml";
  const collectionText = "id: claims\nname: Claims\nfields:\n  title: { type: text }\n";
  const lister = "hubs/support/agents/lister.agent.yaml";

  it("gives a file with an id of its own the new id too, with the places that name it", async () => {
    const { host, renames } = setup(
      [],
      {},
      {
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
        [collection]: collectionText,
        [lister]: "id: lister\nname: Lister\ncollections: [claims]\nmodel: test\n",
      },
    );
    const to = "library/collections/cases.collection.yaml";

    await host.rename(collection, to);

    expect(renames[0]?.rewrites?.[collection]).toBe(
      "id: cases\nname: Claims\nfields:\n  title: { type: text }\n",
    );
    expect(renames[0]?.rewrites?.[lister]).toContain("collections: [cases]");
    expect(await host.renameImpact(collection, to)).toBe(1);
  });

  it("keeps the id of a file whose own id isn't its name, and changes no other file", async () => {
    const old = "library/collections/old-name.collection.yaml";
    const { host, renames } = setup(
      [],
      {},
      {
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
        [old]: collectionText,
        [lister]: "id: lister\nname: Lister\ncollections: [claims]\nmodel: test\n",
      },
    );
    const to = "library/collections/new-name.collection.yaml";

    expect(await host.renameImpact(old, to)).toBe(0);
    await host.rename(old, to);

    expect(renames).toEqual([{ from: old, to, rewrites: {} }]);
  });

  it("refuses to rename a skill whose folder has other files, and moves a SKILL.md alone", async () => {
    const other = "hubs/support/library/skills/refunds/script.sh";
    const { host, renames } = setup([], {}, { ...workspace, [other]: "echo" });
    const to = "hubs/support/library/skills/returns/SKILL.md";

    await expect(host.rename(skill, to)).rejects.toThrow(
      "This skill has other files in its folder, so it can't be renamed here yet.",
    );
    expect(renames).toEqual([]);

    const alone = setup([], {}, workspace);
    await alone.host.rename(skill, to);
    expect(alone.renames).toHaveLength(1);
  });

  it("refuses a path the workspace doesn't serve, a folder and a file on the way", async () => {
    const { host, renames } = setup([], {}, { ...workspace, "notes.md": "hi" });

    await expect(host.rename("notes.md", "hubs//x.yaml")).rejects.toThrow(
      "Files must stay inside the workspace.",
    );
    await expect(host.rename("notes.md", ".git/config")).rejects.toThrow(
      '".git/config" is not part of the workspace definitions',
    );
    await expect(host.rename("notes.md", "hubs/support/agents")).rejects.toThrow(
      "hubs/support/agents is a folder.",
    );
    await expect(host.rename("notes.md", "notes.md/x.yaml")).rejects.toThrow(
      "notes.md is a file, not a folder.",
    );
    expect(renames).toEqual([]);
  });
});

verifies("studio.workspace-files-delete", () => {
  const skill = "hubs/support/library/skills/refunds/SKILL.md";
  const agent = "hubs/support/agents/helper.agent.yaml";
  const workspace = {
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    [skill]: "---\nname: Refunds\ndescription: Use for refunds\n---\nBe kind.\n",
    [agent]: "id: helper\nname: Helper\nskills: [refunds]\nmodel: test\n",
    "notes.md": "hi",
  };

  it("deletes a file as one change and counts the places that name a deleted Library item", async () => {
    const { host, changes } = setup([], {}, workspace);

    const removed = await host.remove(skill);

    expect(removed.places).toBe(1);
    expect(changes).toEqual([{ label: `Deleted ${skill}`, changes: { [skill]: null } }]);
  });

  it("says 0 places for a file nothing names, and undoes the delete while it is the newest step", async () => {
    const { host, undone } = setup([], {}, workspace);

    const removed = await host.remove("notes.md");
    await removed.undo();

    expect(removed.places).toBe(0);
    expect(undone).toHaveLength(1);
  });

  it("rejects the way back, and undoes nothing, after another change", async () => {
    const { host, undone } = setup([], {}, workspace);

    const removed = await host.remove("notes.md");
    host.edit("workspace.yaml", "id: acme\nname: Acme 2\n");

    await expect(removed.undo()).rejects.toThrow(
      "notes.md can't be put back, because the workspace changed after it was deleted.",
    );
    expect(undone).toEqual([]);
  });

  it("refuses a file that isn't there, and a skill whose folder has other files", async () => {
    const other = "hubs/support/library/skills/refunds/script.sh";
    const { host, changes } = setup([], {}, { ...workspace, [other]: "echo" });

    await expect(host.remove("gone.md")).rejects.toThrow("gone.md isn't here any more.");
    await expect(host.remove(skill)).rejects.toThrow(
      "This skill has other files in its folder, so it can't be deleted here yet.",
    );
    expect(changes).toEqual([]);
  });
});
