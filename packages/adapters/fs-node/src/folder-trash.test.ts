import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { FolderDefinitionStore } from "./definition-store.ts";
import { FolderTrash } from "./folder-trash.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const path = "agents/old.agent.yaml";

const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** A workspace with one file, and a trash folder that doesn't exist yet. */
async function trashOf(): Promise<{
  trash: FolderTrash;
  workspace: FolderDefinitionStore;
  root: string;
}> {
  const folder = await tempFolder();
  const workspace = new FolderDefinitionStore(join(folder, "workspace"));
  await workspace.write(path, "kind: agent\n");
  const root = join(folder, "trash");
  return { trash: new FolderTrash(workspace, root, digest), workspace, root };
}

verifies("fs-node.folder-trash", () => {
  it("moves a file out of the workspace and puts it back, leaving no entry", async () => {
    const { trash, workspace, root } = await trashOf();

    const moved = await trash.moveToTrash(path);
    expect(moved.status).toBe("done");
    expect(await workspace.read(path)).toBeNull();
    const trashId = moved.status === "done" ? moved.trashId : "";
    expect(JSON.parse(await readFile(join(root, `${trashId}.json`), "utf8"))).toEqual({
      path,
      content: "kind: agent\n",
    });

    expect(await trash.restore(trashId)).toEqual({ status: "done" });
    expect(await workspace.read(path)).toBe("kind: agent\n");
    expect(await readdir(root)).toEqual([]);
  });

  it("keeps the trash's folder and entries private to the user", async () => {
    const { trash, root } = await trashOf();
    const moved = await trash.moveToTrash(path);

    if (process.platform === "win32") return;
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    const [entry] = await readdir(root);
    expect((await stat(join(root, entry ?? ""))).mode & 0o777).toBe(0o600);
    expect(moved.status).toBe("done");
  });

  it("moves nothing when the file isn't what the caller read, or is gone", async () => {
    const { trash, workspace } = await trashOf();
    const read = await contentDigest("kind: agent\n", digest);
    await workspace.write(path, "kind: agent\nname: Changed\n");

    expect(await trash.moveToTrash(path, read)).toEqual({
      status: "changed-on-disk",
      current: "kind: agent\nname: Changed\n",
    });
    expect(await workspace.read(path)).toBe("kind: agent\nname: Changed\n");
    expect(await trash.moveToTrash("agents/nothing.agent.yaml")).toEqual({
      status: "changed-on-disk",
      current: null,
    });
  });

  it("leaves the file in the workspace when its entry can't be written", async () => {
    const { workspace, root } = await trashOf();
    // A file where the trash's folder should be.
    await writeFile(root, "in the way");
    const trash = new FolderTrash(workspace, root, digest);

    await expect(trash.moveToTrash(path)).rejects.toThrow();

    expect(await workspace.read(path)).toBe("kind: agent\n");
  });

  it("puts nothing over a file that is at the path now, and keeps the entry", async () => {
    const { trash, workspace, root } = await trashOf();
    const moved = await trash.moveToTrash(path);
    await workspace.write(path, "kind: agent\nname: New\n");

    const restored = await trash.restore(moved.status === "done" ? moved.trashId : "");

    expect(restored).toEqual({ status: "occupied", current: "kind: agent\nname: New\n" });
    expect(await workspace.read(path)).toBe("kind: agent\nname: New\n");
    expect(await readdir(root)).toHaveLength(1);
  });

  it("says missing for an id it didn't give, one put back already, and one that names another folder", async () => {
    const { trash, root } = await trashOf();
    const moved = await trash.moveToTrash(path);
    const trashId = moved.status === "done" ? moved.trashId : "";
    await mkdir(join(root, ".."), { recursive: true });
    await writeFile(join(root, "..", "secret.json"), '{"path":"stolen.txt","content":"x"}');

    await trash.restore(trashId);

    expect(await trash.restore(trashId)).toEqual({ status: "missing" });
    expect(await trash.restore("../secret")).toEqual({ status: "missing" });
    expect(await trash.restore("trash-1")).toEqual({ status: "missing" });
  });
});
