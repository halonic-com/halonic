import { isPrivateWorkspacePath } from "@halonicjs/ports";
import { definitionStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryDefinitionStore } from "./definition-store.ts";
import { DryRunDefinitionStore } from "./dry-run-definition-store.ts";

// The files are already in the store under it.
definitionStoreContract("dry run over memory", async (files) => {
  return new DryRunDefinitionStore(new MemoryDefinitionStore(files));
});

// The files are only pending, so the dry run answers every read itself. Private
// files can't be written, so those start in the store under it.
definitionStoreContract("dry run with pending files", async (files) => {
  const entries = Object.entries(files);
  const privateFiles = entries.filter(([path]) => isPrivateWorkspacePath(path));
  const store = new DryRunDefinitionStore(
    new MemoryDefinitionStore(Object.fromEntries(privateFiles)),
  );
  for (const [path, content] of entries) {
    if (!isPrivateWorkspacePath(path)) {
      await store.write(path, content);
    }
  }
  return store;
});

verifies("memory.dry-run-definition-store", () => {
  it("never changes the store under it", async () => {
    const real = new MemoryDefinitionStore({ "a.yaml": "1", "b.yaml": "2" });
    const store = new DryRunDefinitionStore(real);
    await store.write("a.yaml", "changed");
    await store.write("c.yaml", "3");
    await store.remove("b.yaml");
    expect(real.snapshot()).toEqual({ "a.yaml": "1", "b.yaml": "2" });
    expect(await store.list()).toEqual(["a.yaml", "c.yaml"]);
    expect(await store.read("a.yaml")).toBe("changed");
    expect(await store.read("b.yaml")).toBeNull();
  });

  it("records every write and remove in the order they were asked for", async () => {
    const store = new DryRunDefinitionStore(new MemoryDefinitionStore({ "a.yaml": "1" }));
    await store.write("hubs/a/hub.yaml", "id: a\n");
    await store.remove("a.yaml");
    await store.remove("missing.yaml");
    const changes = store.changes();
    expect(changes).toEqual([
      { kind: "write", path: "hubs/a/hub.yaml", content: "id: a\n" },
      { kind: "remove", path: "a.yaml" },
      { kind: "remove", path: "missing.yaml" },
    ]);
    changes.pop();
    expect(store.changes()).toHaveLength(3);
    expect(Object.isFrozen(store.changes()[0])).toBe(true);
  });

  it("keeps the location and version of the store under it until something is pending", async () => {
    const real = new MemoryDefinitionStore({ "a.yaml": "1" }, "memory:demo");
    const store = new DryRunDefinitionStore(real);
    expect(store.location).toBe("memory:demo");
    expect(await store.version()).toBe(await real.version());
    await store.write("a.yaml", "1");
    expect(await store.version()).toMatch(/^dry-run:[0-9a-f]{16}$/);
  });

  it("tells a removed file apart from an empty one in the version", async () => {
    const emptied = new DryRunDefinitionStore(new MemoryDefinitionStore({ "a.yaml": "1" }));
    await emptied.write("a.yaml", "");
    const removed = new DryRunDefinitionStore(new MemoryDefinitionStore({ "a.yaml": "1" }));
    await removed.remove("a.yaml");
    expect(await emptied.version()).not.toBe(await removed.version());
  });
});
