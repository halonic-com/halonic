import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { WorkspaceNewCollection } from "./workspace-new-collection.ts";

function setup() {
  const store: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/collections/claims.collection.yaml":
      "version: 1\nid: claims\nname: Claims\nfields:\n  name:\n    type: text\n    required: true\n",
  };
  const changes: Array<[string, Record<string, string | null>]> = [];
  const made = vi.fn();
  const host = new WorkspaceNewCollection(
    {
      files: {
        read: async (path) => store[path] ?? null,
        list: async (dir) =>
          Object.keys(store)
            .filter((path) => path.startsWith(`${dir}/`))
            .sort(),
        change: (label, written) => changes.push([label, written]),
      },
      onChange: () => () => undefined,
    },
    made,
  );
  return { host, changes, made };
}

verifies("library.new-collection", () => {
  it("shows the collections folder alone while the name is empty", async () => {
    const { host } = setup();
    expect(host.file({ name: "" })).toBe("library/collections/");
    await host.prepare();
    expect(host.file({ name: "" })).toBe("library/collections/");
  });

  it("follows the name to the file, and keeps clear of a collection already there", async () => {
    const { host } = setup();
    await host.prepare();
    expect(host.file({ name: "Invoices" })).toBe("library/collections/invoices.collection.yaml");
    expect(host.file({ name: "Claims" })).toBe("library/collections/claims-2.collection.yaml");
  });

  it("writes the new collection as one change and says which one it is", async () => {
    const { host, changes } = setup();
    const collection = await host.create({ name: "Invoices" });
    expect(collection).toEqual({ hub: null, id: "invoices" });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[0]).toBe("Added collection invoices");
    expect(changes[0]?.[1]["library/collections/invoices.collection.yaml"]).toContain(
      "id: invoices",
    );
  });

  it("tells the Library the new collection's name, so its tab shows it before the list is read", async () => {
    const { host, made } = setup();
    await host.create({ name: " Invoices " });
    expect(made).toHaveBeenCalledExactlyOnceWith({ hub: null, id: "invoices" }, "Invoices");
  });

  it("refuses an empty name in a sentence and writes nothing", async () => {
    const { host, changes } = setup();
    await expect(host.create({ name: "  " })).rejects.toThrow("Give it a name.");
    await expect(host.create({ name: "  " })).rejects.toMatchObject({ kind: "invalid_input" });
    expect(changes).toEqual([]);
  });
});
