import { chmod, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { removeTestFolders, testFolders } from "../folders.test-helper.ts";
import { ChangeableCodeError, refuseChangeableCode, type WriteProbe } from "./own-code-check.ts";

/** Folders made read-only by a test, made writable again so they can be removed. */
const lockedFolders: string[] = [];

afterEach(async () => {
  await Promise.all(lockedFolders.splice(0).map((folder) => chmod(folder, 0o755)));
  await removeTestFolders();
});

/** Code folder `code` with `server.js` and `lib/util.js` in it. */
async function codeFolder() {
  const folders = await testFolders();
  const code = join(folders.outside, "code");
  await mkdir(join(code, "lib"), { recursive: true });
  await writeFile(join(code, "server.js"), "");
  await writeFile(join(code, "lib", "util.js"), "");
  return { folders, code };
}

/** Whether the server's code can't run from a computer that runs tests as an administrator. */
const writesEverything = process.platform === "win32" || process.getuid?.() === 0;

verifies("coding-tools.stdio", () => {
  it("refuses a writable file, and a writable folder without leaving anything in it", async () => {
    const { code } = await codeFolder();
    await expect(refuseChangeableCode([join(code, "server.js")])).rejects.toThrow(
      ChangeableCodeError,
    );
    await expect(refuseChangeableCode([code])).rejects.toThrow(`its code at ${code}`);
    expect((await readdir(code)).sort()).toEqual(["lib", "server.js"]);
  });

  // Windows needs an administrator to make a file link.
  it.skipIf(process.platform === "win32")(
    "probes every file and folder all the way down, and links last",
    async () => {
      const { code } = await codeFolder();
      await symlink(join(code, "server.js"), join(code, "link.js"));
      const probed: string[] = [];
      const probe: WriteProbe = async (path, kind) => {
        probed.push(`${kind} ${relative(code, path)}`);
        return path.endsWith("link.js");
      };
      await expect(refuseChangeableCode([code], probe)).rejects.toThrow(join(code, "link.js"));
      expect(probed.at(-1)).toBe("file link.js");
      expect(probed.toSorted()).toEqual([
        "file lib/util.js",
        "file link.js",
        "file server.js",
        "folder ",
        "folder lib",
      ]);
    },
  );

  it.skipIf(writesEverything)("lets code it can't change start", async () => {
    const { code } = await codeFolder();
    for (const file of [join(code, "server.js"), join(code, "lib", "util.js")])
      await chmod(file, 0o444);
    for (const folder of [join(code, "lib"), code]) {
      await chmod(folder, 0o555);
      lockedFolders.push(folder);
    }
    await expect(refuseChangeableCode([code])).resolves.toBeUndefined();
  });
});
