import { type FolderTree, folderReaderContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryFolderReader } from "./folder-reader.ts";

/** A memory folder that holds `tree`. */
function folderOf(tree: FolderTree): MemoryFolderReader {
  const reader = new MemoryFolderReader("memory:plugins");
  for (const [path, content] of Object.entries(tree.files ?? {})) reader.putFile(path, content);
  for (const path of tree.folders ?? []) reader.putFolder(path);
  for (const [path, target] of Object.entries(tree.links ?? {})) reader.putLink(path, target);
  for (const path of tree.special ?? []) reader.putSpecial(path);
  return reader;
}

folderReaderContract("memory", async (tree) => folderOf(tree), { specialFiles: true });

verifies("memory.folder-reader", () => {
  it("keeps its own copy of the bytes a test puts", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const reader = folderOf({ files: { "acme/tool.bin": bytes } });
    bytes.fill(0);
    expect(await reader.read("acme/tool.bin")).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("removes an entry and everything under it, as a folder deleted mid-read", async () => {
    const reader = folderOf({ files: { "acme/plugin.yaml": "id: acme\n", "acme-two/x": "x" } });
    reader.remove("acme");
    expect((await reader.entries()).map((entry) => entry.path)).toEqual(["acme-two", "acme-two/x"]);
    expect(await reader.read("acme/plugin.yaml")).toBeNull();
  });

  it("refuses to put an entry under a file or a link", () => {
    const reader = folderOf({
      files: { "acme/plugin.yaml": "" },
      links: { "acme/latest": "../x" },
    });
    expect(() => reader.putFile("acme/plugin.yaml/x", "")).toThrow(
      `"acme/plugin.yaml" isn't a folder`,
    );
    expect(() => reader.putFile("acme/latest/x", "")).toThrow(`"acme/latest" isn't a folder`);
  });
});
