import { rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { folderReaderContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { FileSystemFolderReader } from "./folder-reader.ts";
import {
  folderLinkType,
  folderOf,
  onWindows,
  removeTempFolders,
  tempFolder,
} from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

folderReaderContract(
  "file system",
  async (tree) => new FileSystemFolderReader(await folderOf(tree)),
  {
    specialFiles: !onWindows,
  },
);

verifies("fs-node.folder-reader", () => {
  it("gives the real path of the folder and of an entry", async () => {
    const root = await folderOf({ files: { "acme/plugin.yaml": "id: acme\n" } });
    const reader = new FileSystemFolderReader(root, "~/plugins");
    expect(reader.location).toBe("~/plugins");
    const real = await reader.locationOf();
    expect(await reader.locationOf("acme")).toBe(join(real ?? "", "acme"));
  });

  it("reaches the folder through a link above it, and still refuses links inside", async () => {
    const root = await folderOf({ files: { "acme/plugin.yaml": "id: acme\n" } });
    const above = join(await tempFolder(), "plugins");
    await symlink(root, above, folderLinkType);
    const reader = new FileSystemFolderReader(above);
    expect(await reader.entries()).toEqual([
      { path: "acme", kind: "folder" },
      { path: "acme/plugin.yaml", kind: "file", size: 9 },
    ]);
    expect(await reader.read("acme/plugin.yaml")).toEqual(new TextEncoder().encode("id: acme\n"));
    expect(await reader.locationOf()).toBe(await new FileSystemFolderReader(root).locationOf());
  });

  it("lists nothing, and locates nothing, for a folder that isn't there", async () => {
    const reader = new FileSystemFolderReader(join(await tempFolder(), "missing"));
    expect(await reader.entries()).toEqual([]);
    expect(await reader.locationOf()).toBeNull();
    expect(await reader.locationOf("acme")).toBeNull();
  });

  it("leaves out an entry removed while the folder is listed", async () => {
    const root = await folderOf({ files: { "acme/plugin.yaml": "id: acme\n" } });
    const reader = new FileSystemFolderReader(root);
    await rm(join(root, "acme"), { recursive: true });
    expect(await reader.entries()).toEqual([]);
    expect(await reader.read("acme/plugin.yaml")).toBeNull();
  });
});
