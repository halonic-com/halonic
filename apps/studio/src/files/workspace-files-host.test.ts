import { UnreadableWorkspaceFolderError } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { followFilesHost } from "@halonicjs/studio-feature-files/api";
import { createToastStore } from "@halonicjs/studio-kit";
import { SaveState } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-files-host-fixture.ts";

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
    const { host } = setup(new UnreadableWorkspaceFolderError("hubs", "permission denied"));

    await expect(host.list()).rejects.toThrow(
      new KindedError("unavailable", "hubs can't be read."),
    );
  });

  it("keeps the store's kinded error, and an unknown one stays unkinded", async () => {
    const kinded = new KindedError("denied", "This folder isn't open in Halonic.");
    await expect(setup(kinded).host.list()).rejects.toBe(kinded);

    const unknown = new Error("EIO: i/o error, scandir");
    await expect(setup(unknown).host.list()).rejects.toBe(unknown);
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

verifies("studio.workspace-files-watch-limit", () => {
  const tooMany =
    "This folder has more than 50,000 files, too many to watch for changes made outside Halonic. Open a smaller folder to see them as they happen.";

  /** A host whose watch the shell stops, followed as the app follows it, with its toasts. */
  function followed() {
    const { host, watching } = setup([]);
    const toasts = createToastStore();
    const stop = followFilesHost({
      host,
      toasts,
      saving: new SaveState(toasts),
      open: () => undefined,
    });
    return { host, watching, toasts, stop };
  }

  it("says once, in a warning toast that stays, that the folder has too many files to watch", () => {
    const { watching, toasts } = followed();

    watching.failed?.(new KindedError("limit_reached", tooMany));
    watching.failed?.(new KindedError("limit_reached", tooMany));

    expect(toasts.list()).toEqual([
      expect.objectContaining({ tone: "warning", title: tooMany, sticky: true }),
    ]);
    expect(toasts.list()[0]?.action).toBeUndefined();
  });

  it("tells a listener that comes later", () => {
    const { host, watching } = setup([]);
    watching.failed?.(new KindedError("limit_reached", tooMany));

    const heard: string[] = [];
    host.onWatchLimit((reason) => heard.push(reason));

    expect(heard).toEqual([tooMany]);
  });

  it("shows no toast for another watch failure", () => {
    const { watching, toasts } = followed();

    watching.failed?.(new KindedError("unavailable", "The workspace watch stopped: gone"));

    expect(toasts.list()).toEqual([]);
  });

  it("says nothing once the workspace is closed", async () => {
    const { host, watching, toasts, stop } = followed();
    stop();
    await host.dispose();

    watching.failed?.(new KindedError("limit_reached", tooMany));

    expect(toasts.list()).toEqual([]);
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

    expect((await host.renameImpact(skill, to)).places).toBe(1);
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

    expect((await host.renameImpact("notes.md", "todo.md")).places).toBe(0);
    expect(
      (await host.renameImpact(skill, "hubs/support/library/skills/refunds/other.md")).places,
    ).toBe(0);
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
    expect((await host.renameImpact(collection, to)).places).toBe(1);
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

    expect((await host.renameImpact(old, to)).places).toBe(0);
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

  it("undoes the delete after autosave replaced the unsaved changes", async () => {
    const { host, undone, save } = setup([], {}, workspace);

    const removed = await host.remove("notes.md");
    save();
    await removed.undo();

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
    await expect(host.remove(skill)).rejects.toMatchObject({
      kind: "unavailable",
      message: "Studio can't delete a skill that has other files in its folder yet.",
      fix: "To delete refunds, delete the folder hubs/support/library/skills/refunds in File Explorer.",
    });
    expect(changes).toEqual([]);
  });
});

verifies("studio.workspace-files-outside", () => {
  it("tells a listener which files it took in from outside, once for the batch", async () => {
    const { host, watching } = setup(
      ["a.md", "b.md"],
      {},
      {},
      { reloaded: [{ path: "a.md" }, { path: "b.md" }] },
    );
    const heard: (readonly string[])[] = [];
    host.onReloaded((paths) => heard.push(paths));

    watching.changed?.([
      { path: "a.md", kind: "changed" },
      { path: "b.md", kind: "removed" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(heard).toEqual([["a.md", "b.md"]]);
  });

  it("tells no listener when nothing was taken in", async () => {
    const { host, watching } = setup(["a.md"], { "a.md": "mine" }, {}, { held: ["a.md"] });
    const heard: (readonly string[])[] = [];
    host.onReloaded((paths) => heard.push(paths));

    watching.changed?.([{ path: "a.md", kind: "changed" }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(heard).toEqual([]);
  });

  it("holds the files a save left alone, as changed or deleted, and tells a subscriber", () => {
    const { host } = setup(["a.md", "b.md"]);
    let told = 0;
    host.subscribe(() => told++);

    host.noteHeld([
      { path: "a.md", current: "theirs" },
      { path: "b.md", current: null },
    ]);

    expect(host.outside().get("a.md")).toBe("changed");
    expect(host.outside().get("b.md")).toBe("deleted");
    expect(told).toBe(1);
  });
});
