import { readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Trash } from "@halonicjs/app";
import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { FolderDefinitionStore } from "./definition-store.ts";
import { FolderTrash } from "./folder-trash.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
const unix = process.platform !== "win32";
const path = "agents/old.agent.yaml";

async function setup() {
  const base = await tempFolder();
  const store = new FolderDefinitionStore(join(base, "workspace"));
  const folder = join(base, "trash");
  await store.write(path, "id: old\n");
  return { store, folder, trash: new FolderTrash({ folder, store, digest }) };
}

verifies("fs-node.folder-trash", () => {
  it("puts a file back with its text and drops the entry", async () => {
    const { store, folder, trash } = await setup();
    const asApp: Trash = trash;

    const moved = await asApp.moveToTrash(path);
    if (moved.status !== "done") throw new Error("The file wasn't moved.");
    expect(await store.read(path)).toBeNull();
    expect(await readdir(folder)).toEqual([`${moved.trashId}.json`]);

    expect(await trash.restore(moved.trashId)).toEqual({ status: "done" });
    expect(await store.read(path)).toBe("id: old\n");
    expect(await readdir(folder)).toEqual([]);
    expect(await trash.restore(moved.trashId)).toEqual({ status: "missing" });
  });

  it("leaves a file that changed since the caller read it, or is gone", async () => {
    const { store, trash } = await setup();
    const expected = await contentDigest("id: older\n", digest);

    expect(await trash.moveToTrash(path, expected)).toEqual({
      status: "changed-on-disk",
      current: "id: old\n",
    });
    expect(await store.read(path)).toBe("id: old\n");
    expect(await trash.moveToTrash("agents/none.agent.yaml")).toEqual({
      status: "changed-on-disk",
      current: null,
    });
  });

  it("leaves an edit made between the check and the remove, and drops the entry", async () => {
    const { store, folder, trash: _ } = await setup();
    // The person saves while the trash is writing its entry, just before its remove.
    const racing = new FolderTrash({
      folder,
      digest,
      store: new Proxy(store, {
        get(target, name) {
          if (name !== "remove") return Reflect.get(target, name).bind(target);
          return async (...args: Parameters<typeof store.remove>) => {
            await target.write(path, "id: edited\n");
            return await target.remove(...args);
          };
        },
      }),
    });

    expect(await racing.moveToTrash(path)).toEqual({
      status: "changed-on-disk",
      current: "id: edited\n",
    });
    expect(await store.read(path)).toBe("id: edited\n");
    expect(await readdir(folder)).toEqual([]);
  });

  it("doesn't overwrite a file made at the path since", async () => {
    const { store, folder, trash } = await setup();
    const moved = await trash.moveToTrash(path);
    if (moved.status !== "done") throw new Error("The file wasn't moved.");
    await store.write(path, "id: new\n");

    expect(await trash.restore(moved.trashId)).toEqual({
      status: "occupied",
      current: "id: new\n",
    });
    expect(await store.read(path)).toBe("id: new\n");
    expect(await readdir(folder)).toEqual([`${moved.trashId}.json`]);
  });

  it("answers missing for an id the trash didn't make", async () => {
    const { trash } = await setup();

    expect(await trash.restore("../x")).toEqual({ status: "missing" });
    expect(await trash.restore(crypto.randomUUID())).toEqual({ status: "missing" });
  });

  it.runIf(unix)(
    "[platform:win32] needs POSIX links, modes and signals: refuses an entry that is a link",
    async () => {
      const { folder, trash } = await setup();
      const moved = await trash.moveToTrash(path);
      if (moved.status !== "done") throw new Error("The file wasn't moved.");
      const outside = join(await tempFolder(), "entry.json");
      await writeFile(outside, JSON.stringify({ path, content: "outside" }));
      const entry = join(folder, `${moved.trashId}.json`);
      await rm(entry);
      await symlink(outside, entry);

      await expect(trash.restore(moved.trashId)).rejects.toThrow();
    },
  );
});
