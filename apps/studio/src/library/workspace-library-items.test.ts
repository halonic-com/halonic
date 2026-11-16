import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  WorkspaceLibraryItems,
  type WorkspaceLibraryItemsHostParts,
} from "./workspace-library-items.ts";

function setup(extra: Record<string, string> = {}) {
  const store: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/empty/hub.yaml": "id: empty\nname: Empty\n",
    "hubs/support/library/skills/refunds/SKILL.md":
      "---\nname: Refunds\ndescription: Use for refund questions\n---\nBe kind.\n",
    "library/skills/tone/SKILL.md": "---\nname: Tone\ndescription: How we write\n---\nPlain.\n",
    "hubs/support/agents/helper.agent.yaml":
      "id: helper\nname: Helper\nskills: [refunds]\nmodel: test\n",
    "library/collections/claims.collection.yaml":
      "id: claims\nname: Claims\nfields:\n  amount: { type: number }\n  note: { type: text }\n",
    ...extra,
  };
  const history: Record<string, string>[] = [];
  let pending = {};
  const listeners = new Set<() => void>();
  const files: WorkspaceLibraryItemsHostParts["files"] = {
    get pending() {
      return pending;
    },
    change: (_label, changes) => {
      pending = {};
      history.push({ ...store });
      for (const [path, text] of Object.entries(changes)) {
        if (text === null) delete store[path];
        else store[path] = text;
      }
    },
    undo: () => {
      const previous = history.pop();
      if (previous === undefined) return false;
      pending = {};
      for (const path of Object.keys(store)) delete store[path];
      Object.assign(store, previous);
      return true;
    },
    read: async (path) => store[path] ?? null,
    list: async (dir) =>
      Object.keys(store)
        .filter((path) => path.startsWith(`${dir}/`))
        .sort(),
  };
  const host = new WorkspaceLibraryItems({
    files,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const edit = (path: string, text: string) => files.change("Edited", { [path]: text });
  return { host, listeners, store, edit, ctrlZ: () => files.undo() };
}

verifies("library.library-page", () => {
  it("lists a kind's items by hub, then what the workspace shares", async () => {
    const { host } = setup();
    const listing = await host.list("skill");
    expect(listing.hubs.map((hub) => [hub.id, hub.entries.map((entry) => entry.name)])).toEqual([
      ["empty", []],
      ["support", ["Refunds"]],
    ]);
    expect(listing.shared?.workspaceName).toBe("Acme");
    expect(listing.shared?.entries.map((entry) => entry.name)).toEqual(["Tone"]);
    expect(listing.shared?.entries[0]?.detail).toBe("How we write");
  });

  it("says who uses an item", async () => {
    const { host } = setup();
    const refunds = (await host.list("skill")).hubs.find((hub) => hub.id === "support")?.entries[0];
    expect(refunds?.usage.agents.map((agent) => agent.id)).toEqual(["helper"]);
  });

  it("counts a collection's fields as its detail", async () => {
    const { host } = setup();
    expect((await host.list("collection")).shared?.entries[0]?.detail).toBe("2 fields");
  });

  it("leaves out the shared section when nothing is shared", async () => {
    const { host } = setup();
    expect((await host.list("connector")).shared).toBeUndefined();
  });

  it("tells the app when the files change, until it stops", () => {
    const { host, listeners } = setup();
    const stop = host.subscribe(() => {});
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});

verifies("library.library-delete", () => {
  it("deletes a skill's whole folder and Undo brings it back", async () => {
    const { host, store } = setup({ "library/skills/tone/notes.md": "More." });
    const removed = await host.remove("skill", { hub: null, id: "tone" });
    expect(Object.keys(store).filter((path) => path.includes("skills/tone"))).toEqual([]);
    await removed.undo();
    expect(store["library/skills/tone/SKILL.md"]).toContain("Plain.");
    expect(store["library/skills/tone/notes.md"]).toBe("More.");
  });

  it("deletes the one file of a collection and of a hub's connector", async () => {
    const { host, store } = setup({
      "hubs/support/library/connectors/mail.connector.yaml": "id: mail\n",
    });
    await host.remove("collection", { hub: null, id: "claims" });
    await host.remove("connector", { hub: "support", id: "mail" });
    expect(store["library/collections/claims.collection.yaml"]).toBeUndefined();
    expect(store["hubs/support/library/connectors/mail.connector.yaml"]).toBeUndefined();
  });

  it("says so when the item is gone, and changes nothing", async () => {
    const { host, store } = setup();
    const before = { ...store };
    await expect(host.remove("knowledge", { hub: null, id: "missing" })).rejects.toThrow(
      "isn't in this workspace any more",
    );
    expect(store).toEqual(before);
  });

  it("refuses an Undo after another change, and undoes nothing", async () => {
    const { host, store, edit } = setup();
    const removed = await host.remove("skill", { hub: null, id: "tone" });
    edit("library/collections/claims.collection.yaml", "id: claims\nname: Claims 2\n");
    await expect(removed.undo()).rejects.toMatchObject({
      kind: "conflict",
      message: expect.stringContaining("can't be put back"),
    });
    expect(store["library/skills/tone/SKILL.md"]).toBeUndefined();
    expect(store["library/collections/claims.collection.yaml"]).toContain("Claims 2");
  });

  it("refuses an Undo after the delete was undone some other way", async () => {
    const { host, store, ctrlZ } = setup();
    const removed = await host.remove("skill", { hub: null, id: "tone" });
    ctrlZ();
    expect(store["library/skills/tone/SKILL.md"]).toContain("Plain.");
    await expect(removed.undo()).rejects.toThrow("can't be put back");
    expect(store["library/skills/tone/SKILL.md"]).toContain("Plain.");
  });

  it("refuses a second Undo", async () => {
    const { host } = setup();
    const removed = await host.remove("skill", { hub: null, id: "tone" });
    await removed.undo();
    await expect(removed.undo()).rejects.toThrow("can't be put back");
  });
});
