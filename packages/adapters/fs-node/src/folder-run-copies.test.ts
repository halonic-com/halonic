import { readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunCopies } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { FolderRunCopies } from "./folder-run-copies.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

/** Windows has no file modes, and a symbolic link there needs a privilege a test can't count on. */
const unix = process.platform !== "win32";

async function copiesIn(): Promise<{ copies: FolderRunCopies; root: string }> {
  const root = join(await tempFolder(), "run-copies");
  return { copies: new FolderRunCopies(root), root };
}

verifies("fs-node.folder-run-copies", () => {
  it("is the copies the app's run proposals work in", async () => {
    const { copies } = await copiesIn();
    const asApp: RunCopies = copies;

    expect(asApp.folderOf("run_1")).toBe(copies.folderOf("run_1"));
  });

  it("keeps the two sides apart, in a folder of the run's own", async () => {
    const { copies, root } = await copiesIn();
    await copies.create("run_1");

    await copies.store("run_1", "base").write("agents/a.yaml", "id: a\n");

    expect(await copies.store("run_1", "run").read("agents/a.yaml")).toBeNull();
    expect(await readdir(join(root, "run_1"))).toEqual(["base", "run"]);
    expect(copies.folderOf("run_1")).toBe(join(root, "run_1", "run"));
  });

  it("never lets a run id name another folder", async () => {
    const { copies, root } = await copiesIn();

    await expect(copies.create("../other")).rejects.toThrow(RangeError);
    await expect(copies.remove("a/b")).rejects.toThrow(RangeError);
    expect(() => copies.folderOf("")).toThrow(RangeError);
    expect(await copies.list()).toEqual([]);
    expect(await readdir(join(root, "..")).then((names) => names.includes("other"))).toBe(false);
  });

  it("empties a copy left from an earlier start of the same run", async () => {
    const { copies } = await copiesIn();
    await copies.create("run_1");
    await copies.store("run_1", "run").write("left.txt", "left over");

    await copies.create("run_1");

    expect(await copies.store("run_1", "run").list()).toEqual([]);
  });

  it.runIf(unix)(
    "[platform:win32] needs POSIX links, modes and signals: doesn't read a file a link in the run side points to",
    async () => {
      const { copies } = await copiesIn();
      await copies.create("run_1");
      const outside = join(await tempFolder(), "secret.txt");
      await writeFile(outside, "outside");
      await symlink(outside, join(copies.folderOf("run_1"), "link.txt"));

      await expect(copies.store("run_1", "run").read("link.txt")).rejects.toThrow(
        "doesn't follow links",
      );
      expect(await copies.store("run_1", "run").list()).toEqual([]);
    },
  );

  it("lists the copies sorted, and removes one, even twice", async () => {
    const { copies } = await copiesIn();
    expect(await copies.list()).toEqual([]);
    await copies.create("run_b");
    await copies.create("run_a");
    expect(await copies.list()).toEqual(["run_a", "run_b"]);

    await copies.remove("run_a");
    await copies.remove("run_a");

    expect(await copies.list()).toEqual(["run_b"]);
  });
});
