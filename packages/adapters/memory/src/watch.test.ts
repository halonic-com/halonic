import type { WorkspaceFileChange } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryDefinitionStore } from "./definition-store.ts";
import { DryRunDefinitionStore } from "./dry-run-definition-store.ts";

/** A store with `files` and an open watch that keeps every batch. */
async function watched(files: Record<string, string>) {
  const store = new MemoryDefinitionStore(files);
  const batches: (readonly WorkspaceFileChange[])[] = [];
  const watch = await store.watch({
    changed: (changes) => batches.push(changes),
    failed: (error) => {
      throw error;
    },
  });
  return { store, batches, watch };
}

verifies("ports.definition-store-watch", () => {
  it("reports what a test changes outside as one sorted batch", async () => {
    const { store, batches } = await watched({ "a.yaml": "1", "b.yaml": "1" });
    store.changeOutside({ "b.yaml": null, "a.yaml": "2", "c.yaml": "new" });
    expect(batches).toEqual([
      [
        { path: "a.yaml", kind: "changed" },
        { path: "b.yaml", kind: "removed" },
        { path: "c.yaml", kind: "changed" },
      ],
    ]);
    expect(await store.read("a.yaml")).toBe("2");
    expect(await store.read("b.yaml")).toBeNull();
  });

  it("doesn't report its own writes, private entries or a file left as it was", async () => {
    const { store, batches } = await watched({ "a.yaml": "1" });
    await store.write("a.yaml", "2");
    await store.remove("a.yaml");
    store.changeOutside({ ".git/index": "x", "same.yaml": null });
    expect(batches).toEqual([]);
  });

  it("reports nothing once closed", async () => {
    const { store, batches, watch } = await watched({ "a.yaml": "1" });
    await watch.close();
    store.changeOutside({ "a.yaml": "2" });
    expect(batches).toEqual([]);
  });

  it("reports nothing from a dry run, whose changes are all its own", async () => {
    const dryRun = new DryRunDefinitionStore(new MemoryDefinitionStore({ "a.yaml": "1" }));
    const batches: (readonly WorkspaceFileChange[])[] = [];
    const watch = await dryRun.watch({
      changed: (changes) => batches.push(changes),
      failed: (error) => {
        throw error;
      },
    });
    await dryRun.write("a.yaml", "2");
    await dryRun.remove("a.yaml");
    await watch.close();
    expect(batches).toEqual([]);
  });
});
