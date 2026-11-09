import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { definitionStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, it } from "vitest";
import { FolderDefinitionStore } from "./definition-store.ts";
import { removeTempFolders, tempFolder, writeFiles } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

definitionStoreContract("folder", async (files) => {
  const root = await tempFolder();
  await writeFiles(root, files);
  return new FolderDefinitionStore(root);
});

/** A folder holding `real.yaml`, `agents/real.yaml` and `outside/secret.yaml`, plus links into them. */
async function linkedWorkspace(): Promise<{ root: string; store: FolderDefinitionStore }> {
  const outside = await tempFolder();
  await writeFiles(outside, { "secret.yaml": "secret\n" });
  const root = await tempFolder();
  await writeFiles(root, { "agents/real.yaml": "id: real\n", "hubs/a/hub.yaml": "id: a\n" });
  await symlink(join(root, "agents/real.yaml"), join(root, "agents/link.yaml"));
  await symlink(outside, join(root, "hubs/shared"), "dir");
  await symlink(join(root, "hubs/a"), join(root, "hubs/inside"), "dir");
  return { root, store: new FolderDefinitionStore(root) };
}

verifies("ports.definition-store-private-entries", () => {
  it("refuses a link in the last segment, even one that points inside the root", async () => {
    const { store } = await linkedWorkspace();
    await expect(store.read("agents/link.yaml")).rejects.toThrow(RangeError);
    await expect(store.write("agents/link.yaml", "x")).rejects.toThrow(RangeError);
    await expect(store.remove("agents/link.yaml")).rejects.toThrow(RangeError);
    expect(await store.list("agents")).toEqual(["agents/real.yaml"]);
  });

  it("refuses a link in any segment, and lists nothing under one", async () => {
    const { root, store } = await linkedWorkspace();
    for (const path of ["hubs/shared/secret.yaml", "hubs/inside/hub.yaml"]) {
      await expect(store.read(path), path).rejects.toThrow(RangeError);
      await expect(store.write(path, "x"), path).rejects.toThrow(RangeError);
      await expect(store.remove(path), path).rejects.toThrow(RangeError);
    }
    await expect(store.list("hubs/shared")).rejects.toThrow(RangeError);
    expect(await store.list()).toEqual(["agents/real.yaml", "hubs/a/hub.yaml"]);
    expect(await readFile(join(root, "hubs/shared/secret.yaml"), "utf8")).toBe("secret\n");
  });
});

verifies("fs-node.definition-store", () => {
  it("keeps the files as plain files under the root", async () => {
    const root = await tempFolder();
    const store = new FolderDefinitionStore(root);
    await store.write("hubs/a/hub.yaml", "id: a\n");
    expect(await readFile(join(root, "hubs/a/hub.yaml"), "utf8")).toBe("id: a\n");
    expect(store.location).toBe(root);
    expect(new FolderDefinitionStore(root, "~/workspaces/acme").location).toBe("~/workspaces/acme");
  });

  it("gives the same version as the memory store for the same files", async () => {
    const files = { "workspace.yaml": "id: acme\n", "hubs/a/hub.yaml": "id: a\n" };
    const root = await tempFolder();
    await writeFiles(root, files);
    const version = await new FolderDefinitionStore(root).version();
    expect(version).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(version).toBe(await new MemoryDefinitionStore(files).version());
  });

  it("leaves out a file name a workspace path can't hold, and lists nothing for a missing root", async () => {
    const root = await tempFolder();
    await writeFiles(root, { "a\\b.yaml": "x", "a.yaml": "1" });
    expect(await new FolderDefinitionStore(root).list()).toEqual(["a.yaml"]);
    expect(await new FolderDefinitionStore(join(root, "missing")).list()).toEqual([]);
  });

  it("reads null for a folder, lists nothing for a file, and leaves a folder alone on remove", async () => {
    const root = await tempFolder();
    await writeFiles(root, { "hubs/a/hub.yaml": "id: a\n" });
    const store = new FolderDefinitionStore(root);
    expect(await store.read("hubs/a")).toBeNull();
    expect(await store.list("hubs/a/hub.yaml")).toEqual([]);
    await store.remove("hubs/a");
    expect(await store.list()).toEqual(["hubs/a/hub.yaml"]);
  });

  it("reports a write that the file system refuses", async () => {
    const root = await tempFolder();
    await mkdir(join(root, "hubs"));
    await writeFile(join(root, "file.yaml"), "1");
    const store = new FolderDefinitionStore(root);
    await expect(store.write("hubs", "x")).rejects.toMatchObject({ code: "EISDIR" });
    await expect(store.write("file.yaml/a.yaml", "x")).rejects.toThrow();
  });

  it("passes on a file system error other than a missing entry", async () => {
    const root = await tempFolder();
    await writeFiles(root, { "locked/a.yaml": "1" });
    const store = new FolderDefinitionStore(root);
    await chmod(join(root, "locked"), 0o000);
    try {
      await expect(store.list()).rejects.toMatchObject({ code: "EACCES" });
      await expect(store.read("locked/a.yaml")).rejects.toMatchObject({ code: "EACCES" });
    } finally {
      await chmod(join(root, "locked"), 0o700);
    }
  });
});
