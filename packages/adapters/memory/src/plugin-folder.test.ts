import { type FolderTree, pluginFolderWriterContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryPluginFolder } from "./plugin-folder.ts";

/** A memory plugins folder that holds `tree`. */
function pluginFolderOf(tree: FolderTree): MemoryPluginFolder {
  const folder = new MemoryPluginFolder();
  const { reader } = folder;
  for (const [path, content] of Object.entries(tree.files ?? {})) reader.putFile(path, content);
  for (const path of tree.folders ?? []) reader.putFolder(path);
  for (const [path, target] of Object.entries(tree.links ?? {})) reader.putLink(path, target);
  for (const path of tree.special ?? []) reader.putSpecial(path);
  return folder;
}

pluginFolderWriterContract("memory", async (tree) => {
  const folder = pluginFolderOf(tree);
  return { writer: folder, reader: folder.reader };
});

verifies("memory.plugin-folder", () => {
  it("keeps its own copy of the bytes it placed", async () => {
    const folder = new MemoryPluginFolder();
    const bytes = new Uint8Array([1, 2, 3]);
    await folder.place("weather", new Map([["plugin.yaml", bytes]]), { replace: false });
    bytes.fill(0);
    expect(await folder.reader.read("weather/plugin.yaml")).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("shares its location with its reader", () => {
    expect(new MemoryPluginFolder("memory:profile/plugins").location).toBe(
      "memory:profile/plugins",
    );
  });
});
