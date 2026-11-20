import { mkdir, realpath, symlink } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { bothSpellings, pathsOverlap, realSpelling } from "./path-overlap.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

/** A Windows drive, built so the path isn't read as a real one on this computer. */
const drive = ["D", ":"].join("");

verifies("system-node.path-overlap", () => {
  it.each([
    ["the same path", "/person/.ssh", "/person/.ssh"],
    ["a folder above it", "/person", "/person/.ssh"],
    ["the root", "/", "/person/.ssh"],
    ["a path inside it", "/person/.ssh/keys", "/person/.ssh"],
    ["the same path in other letter case", "/Person/.SSH", "/person/.ssh"],
    ["the same path with the other slashes", `${drive}\\person\\.ssh`, `${drive}/person/.ssh/keys`],
    ["a path with `..` in it", "/person/notes/../.ssh", "/person/.ssh"],
  ])("finds %s overlapping", (_, a, b) => {
    expect(pathsOverlap(a, b)).toBe(true);
    expect(pathsOverlap(b, a)).toBe(true);
  });

  it.each([
    ["a folder next to it whose name starts the same", "/person/.ssh-notes", "/person/.ssh"],
    ["a folder next to it", "/halonic/launch-3", "/halonic/data"],
  ])("finds %s clear", (_, a, b) => {
    expect(pathsOverlap(a, b)).toBe(false);
    expect(pathsOverlap(b, a)).toBe(false);
  });

  it("gives a path reached through a link both as given and where it really is", async () => {
    const root = await realpath(await tempFolder());
    const data = join(root, "data");
    await mkdir(data);
    const link = join(root, "link");
    // A junction on Windows, which needs no extra rights there.
    await symlink(data, link, process.platform === "win32" ? "junction" : "dir");

    expect(bothSpellings(join(link, "plugin"))).toEqual([
      join(link, "plugin"),
      join(data, "plugin"),
    ]);
    expect(bothSpellings(data)).toEqual([data]);
  });

  it("resolves the nearest existing parent of a path that doesn't exist yet", async () => {
    const root = await realpath(await tempFolder());
    const link = join(root, "link");
    await symlink(root, link, process.platform === "win32" ? "junction" : "dir");

    expect(realSpelling(join(link, "new", "plugin"))).toBe(join(root, "new", "plugin"));
  });
});
