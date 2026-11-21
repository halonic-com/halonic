import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-files-host-fixture.ts";

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

  it("puts the file back as a change of its own after another change, and keeps that change", async () => {
    const { host, undone, changes } = setup([], {}, workspace);

    const removed = await host.remove("notes.md");
    host.edit("workspace.yaml", "id: acme\nname: Acme 2\n");
    await removed.undo();

    expect(undone).toEqual([]);
    expect(changes.map(({ label }) => label)).toEqual([
      "Deleted notes.md",
      "Edited workspace.yaml",
      "Put back notes.md",
    ]);
    expect(changes.at(-1)?.changes).toEqual({ "notes.md": "hi" });
  });

  it("rejects the way back, and writes nothing, when a new file has taken its place", async () => {
    const { host, undone, changes } = setup([], {}, workspace);

    const removed = await host.remove("notes.md");
    host.edit("notes.md", "new");

    await expect(removed.undo()).rejects.toMatchObject({
      kind: "conflict",
      message:
        "notes.md can't be put back, because there is a new notes.md. Rename or move it, then undo again.",
    });
    expect(undone).toEqual([]);
    expect(changes).toHaveLength(2);
  });

  it("refuses a file that isn't there", async () => {
    const { host, changes } = setup([], {}, workspace);

    await expect(host.remove("gone.md")).rejects.toThrow("gone.md isn't here any more.");
    expect(changes).toEqual([]);
  });
});
