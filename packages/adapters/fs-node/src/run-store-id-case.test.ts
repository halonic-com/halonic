// HAL-4749, after HAL-4695: run ids are case-sensitive, also in a folder that
// ignores case (on Windows and macOS by default), where `RUN_X.jsonl` opens
// `run_x`'s log. The reads and the refusal are tested in run-store.test.ts.

import { copyFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { errorKindOf } from "@halonicjs/std";
import { entered, started } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { FolderRunStore } from "./run-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

/** Whether the temporary folders ignore case, as by default on Windows and macOS. */
const folderIgnoresCase = await (async () => {
  const root = await tempFolder();
  await writeFile(join(root, "probe"), "");
  try {
    await stat(join(root, "PROBE"));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
})();

verifies("fs-node.run-store-run-id-case", () => {
  it("refuses an append under an id in another case as invalid input, not as a conflict", async () => {
    const root = await tempFolder();
    const store = new FolderRunStore(root);
    await store.append("run_x", 0, [started("run_x"), entered("run_x", 2)]);
    // What a case-insensitive file system gives for "RUN_X": the log of "run_x".
    await copyFile(join(root, "run_x.jsonl"), join(root, "RUN_X.jsonl"));
    for (const [expectedSeq, event] of [
      [0, started("RUN_X")],
      [2, entered("RUN_X", 3)],
    ] as const) {
      const kind = await store.append("RUN_X", expectedSeq, [event]).catch(errorKindOf);
      expect(kind).toBe("invalid_input");
    }
  });

  // A crash on the first write of `run_x` left half a line, which can't
  // tell whose log it is, so the folder's names tell. The Windows and macOS
  // jobs of CI check the first branch, Linux the second.
  it("tells a log without a whole line by the folder's names", async () => {
    const root = await tempFolder();
    const store = new FolderRunStore(root);
    const torn = JSON.stringify(started("run_x")).slice(0, 20);
    await writeFile(join(root, "run_x.jsonl"), torn);
    const append = store.append("RUN_X", 0, [started("RUN_X")]);
    if (folderIgnoresCase) {
      await expect(append).rejects.toThrow("clashes with a stored run");
      expect(await readFile(join(root, "run_x.jsonl"), "utf8")).toBe(torn);
      expect(await readdir(root)).not.toContain("RUN_X.jsonl");
    } else {
      expect(await append).toEqual({ ok: true, lastSeq: 1 });
      expect(await readdir(root)).toEqual(expect.arrayContaining(["RUN_X.jsonl", "run_x.jsonl"]));
    }
  });
});
