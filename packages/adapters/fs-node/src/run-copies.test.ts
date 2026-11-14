import { mkdir, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { FolderRunCopies } from "./run-copies.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const runId = "01JD8Q0000000000000000000A";
const otherRunId = "01JD8Q0000000000000000000B";

/** Copies in a new folder that doesn't exist yet, as the profile's is before the first run. */
async function copiesIn(): Promise<{ copies: FolderRunCopies; root: string; outside: string }> {
  const folder = await tempFolder();
  const root = join(folder, "run-copies");
  return { copies: new FolderRunCopies(root), root, outside: join(folder, "outside") };
}

verifies("fs-node.run-copies-folder", () => {
  it("keeps the base and run sides apart, and gives the folder of the run side", async () => {
    const { copies, root } = await copiesIn();
    await copies.create(runId);

    await copies.store(runId, "run").write("agents/coder.agent.yaml", "kind: agent\n");

    expect(await copies.store(runId, "base").read("agents/coder.agent.yaml")).toBeNull();
    expect(copies.folderOf(runId)).toBe(join(root, runId, "run"));
    expect(await readFile(join(copies.folderOf(runId), "agents/coder.agent.yaml"), "utf8")).toBe(
      "kind: agent\n",
    );
  });

  it("makes the copy's folders private to the user", async () => {
    const { copies, root } = await copiesIn();
    await copies.create(runId);

    if (process.platform === "win32") return;
    for (const folder of [root, join(root, runId), join(root, runId, "run")]) {
      expect((await stat(folder)).mode & 0o777).toBe(0o700);
    }
  });

  it("replaces a copy left under the same run id by an empty one", async () => {
    const { copies } = await copiesIn();
    await copies.create(runId);
    await copies.store(runId, "base").write("old.txt", "left over");

    await copies.create(runId);

    expect(await copies.store(runId, "base").list()).toEqual([]);
  });

  it("removes a copy with a link in it without following the link, and nothing when it is gone", async () => {
    const { copies, outside } = await copiesIn();
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "keep.txt"), "kept");
    await copies.create(runId);
    await symlink(outside, join(copies.folderOf(runId), "link"));

    await copies.remove(runId);
    await copies.remove(runId);

    expect(await copies.list()).toEqual([]);
    expect(await readFile(join(outside, "keep.txt"), "utf8")).toBe("kept");
  });

  it("lists the run ids of the copies, sorted, and nothing else in the folder", async () => {
    const { copies, root } = await copiesIn();
    expect(await copies.list()).toEqual([]);
    await copies.create(otherRunId);
    await copies.create(runId);
    await mkdir(join(root, ".notes"));
    await writeFile(join(root, "01JD8Q0000000000000000000C"), "a file, not a copy");

    expect(await copies.list()).toEqual([runId, otherRunId]);
  });

  it("refuses an id that would name a folder outside the root", async () => {
    const { copies, root } = await copiesIn();

    await expect(copies.create("../escape")).rejects.toBeInstanceOf(RangeError);
    expect(() => copies.folderOf("../escape")).toThrow(RangeError);
    expect(() => copies.store("../escape", "run")).toThrow(RangeError);
    await expect(copies.remove("../escape")).rejects.toBeInstanceOf(RangeError);
    expect(await readdir(join(root, ".."))).not.toContain("escape");
  });
});
