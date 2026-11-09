import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { folderSize } from "./folder-size.ts";
import { removeTempFolders, tempFolder, writeSizedFile } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

verifies("system-node.resource-probe", () => {
  it("stops at the file limit and says the size is incomplete", async () => {
    const root = await tempFolder();
    await writeSizedFile(join(root, "a"), 1);
    await writeSizedFile(join(root, "b"), 1);
    await writeSizedFile(join(root, "deeper", "c"), 1);
    expect(await folderSize(root, 2)).toEqual({ bytes: 2, complete: false });
    expect(await folderSize(root, 3)).toEqual({ bytes: 3, complete: true });
  });

  it("doesn't follow or count a link to a file or a folder outside", async () => {
    const outside = await tempFolder();
    await writeSizedFile(join(outside, "big"), 5000);
    const root = await tempFolder();
    await writeSizedFile(join(root, "small"), 3);
    await symlink(join(outside, "big"), join(root, "file-link"));
    await symlink(outside, join(root, "folder-link"), "dir");
    expect(await folderSize(root, 100)).toEqual({ bytes: 3, complete: true });
  });

  it("gives 0 bytes, complete, for a file or a link given as the folder", async () => {
    const root = await tempFolder();
    await writeSizedFile(join(root, "file"), 9);
    await symlink(root, join(root, "link"), "dir");
    expect(await folderSize(join(root, "file"), 100)).toEqual({ bytes: 0, complete: true });
    expect(await folderSize(join(root, "link"), 100)).toEqual({ bytes: 0, complete: true });
  });
});
