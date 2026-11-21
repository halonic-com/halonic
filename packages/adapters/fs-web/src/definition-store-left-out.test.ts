import { definitionSourceLeftOutContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { BrowserFolderDefinitionStore } from "./definition-store.ts";
import { FakeDisk } from "./fake-folder.test-helper.ts";

definitionSourceLeftOutContract("browser folder", async (files) => {
  return new BrowserFolderDefinitionStore(new FakeDisk(files).root);
});

verifies("fs-web.definition-store-left-out", () => {
  it("never steps into a left-out folder", async () => {
    const disk = new FakeDisk({ "repo/locked/a.ts": "a\n", "workspace.yaml": "id: acme\n" });
    const store = new BrowserFolderDefinitionStore(disk.root);
    disk.failOnce("values", "locked", "NotReadableError");
    expect(await store.list(undefined, { leaveOut: { folders: ["repo"] } })).toEqual([
      "workspace.yaml",
    ]);
    // Without the option the same walk reaches the folder and its failure.
    await expect(store.list()).rejects.toThrow(
      expect.objectContaining({ name: "NotReadableError" }),
    );
  });

  it("gives nothing for a left-out folder it is asked to list", async () => {
    const store = new BrowserFolderDefinitionStore(new FakeDisk({ "repo/a.ts": "a\n" }).root);
    expect(await store.list("repo", { leaveOut: { folders: ["repo"] } })).toEqual([]);
    expect(await store.list("repo", { leaveOut: { folders: ["REPO"] } })).toEqual([]);
  });

  it("gives the version of the files it lists, as the memory store works it out", async () => {
    const listed = { "workspace.yaml": "id: a\n" };
    const files = { ...listed, "repo/a.ts": "a\n", "node_modules/x.js": "x\n" };
    const leaveOut = { folders: ["repo"], names: ["node_modules"] };
    const withLeftOut = new BrowserFolderDefinitionStore(new FakeDisk(files).root);
    const onlyListed = new BrowserFolderDefinitionStore(new FakeDisk(listed).root);
    expect(await withLeftOut.version({ leaveOut })).toBe(await onlyListed.version());
  });
});
