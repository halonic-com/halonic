import { isPrivateWorkspacePath } from "@halonicjs/ports";
import { definitionSourceLeftOutContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryDefinitionStore } from "./definition-store.ts";
import { DryRunDefinitionStore } from "./dry-run-definition-store.ts";

const repo = { folders: ["repo"] };

definitionSourceLeftOutContract("memory", async (files) => new MemoryDefinitionStore(files));

definitionSourceLeftOutContract("dry run over memory", async (files) => {
  return new DryRunDefinitionStore(new MemoryDefinitionStore(files));
});

// Pending writes to a left-out file must not count in the dry run's version either.
definitionSourceLeftOutContract("dry run with pending files", async (files) => {
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

verifies("memory.definition-store-left-out", () => {
  it("lists without the left-out folder", async () => {
    const store = new MemoryDefinitionStore({ "repo/a.ts": "a\n", "workspace.yaml": "id: acme\n" });
    expect(await store.list(undefined, { leaveOut: repo })).toEqual(["workspace.yaml"]);
  });

  it("doesn't count a pending change to a left-out file in a dry run's version", async () => {
    const wrapped = new MemoryDefinitionStore({ "workspace.yaml": "id: acme\n" });
    const dryRun = new DryRunDefinitionStore(wrapped);
    await dryRun.write("repo/a.ts", "a\n");
    expect(await dryRun.version({ leaveOut: repo })).toBe(
      await wrapped.version({ leaveOut: repo }),
    );
    expect(await dryRun.version()).toMatch(/^dry-run:/u);
  });
});
