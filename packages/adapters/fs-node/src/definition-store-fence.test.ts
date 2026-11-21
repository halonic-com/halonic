import { readdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import type { DefinitionWatch, WorkspaceFileChange } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { FolderDefinitionStore } from "./definition-store.ts";
import { fenceAround, fenceHolds } from "./folder-fence.ts";
import { removeTempFolders, tempFolder, writeFiles } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

afterEach(() => {
  vi.useRealTimers();
});

/** A home folder used as the workspace, with the default profile inside it. */
async function homeWorkspace(): Promise<{ root: string; store: FolderDefinitionStore }> {
  const root = await tempFolder();
  await writeFiles(root, {
    "agents/a.yaml": "id: a\n",
    ".local/share/halonic/trust/x.json": "{}\n",
    ".local/share/other/keep.md": "kept\n",
  });
  const fence = join(root, ".local", "share", "halonic");
  return { root, store: new FolderDefinitionStore(root, undefined, { fence }) };
}

verifies("fs-node.definition-store-profile-fence", () => {
  it("leaves the profile out of lists, the count and the version", async () => {
    const { store } = await homeWorkspace();
    const unfenced = new FolderDefinitionStore((await homeWorkspace()).root);
    expect(await store.list()).toEqual([".local/share/other/keep.md", "agents/a.yaml"]);
    expect(await store.list(".local/share")).toEqual([".local/share/other/keep.md"]);
    expect(await store.hasMoreFilesThan(2)).toBe(false);
    expect(await unfenced.hasMoreFilesThan(2)).toBe(true);
  });

  it("refuses to read, write or remove a file in the profile", async () => {
    const { store } = await homeWorkspace();
    const path = ".local/share/halonic/trust/x.json";
    await expect(store.read(path)).rejects.toThrow(RangeError);
    await expect(store.write(path, "{}")).rejects.toThrow(RangeError);
    await expect(store.remove(path)).rejects.toThrow(RangeError);
    await expect(store.list(".local/share/halonic")).rejects.toThrow(RangeError);
    expect(await store.read(".local/share/other/keep.md")).toBe("kept\n");
  });

  it("refuses a write into a profile not made yet, and makes nothing", async () => {
    const root = await tempFolder();
    const store = new FolderDefinitionStore(root, undefined, {
      fence: join(root, ".local", "share", "halonic"),
    });
    await expect(store.write(".local/share/halonic/unfenced-runs/x", "yes")).rejects.toThrow(
      RangeError,
    );
    expect(await readdir(root)).toEqual([]);
  });

  it("refuses the profile in another letter case, as a file system that folds case opens it", async () => {
    const root = await tempFolder();
    const store = new FolderDefinitionStore(root, undefined, { fence: join(root, "profile") });
    await expect(store.write("PROFILE/trust/x.json", "{}")).rejects.toThrow(RangeError);
    await expect(store.write("profile./trust/x.json", "{}")).rejects.toThrow(RangeError);
  });

  it("serves a sibling whose name starts like the profile's", async () => {
    const root = await tempFolder();
    const store = new FolderDefinitionStore(root, undefined, { fence: join(root, "profile") });
    expect(await store.write("profile-old/a.md", "a\n")).toEqual({ status: "written" });
    expect(await store.list()).toEqual(["profile-old/a.md"]);
  });

  it("refuses everything when the workspace is inside the profile", async () => {
    const profile = await tempFolder();
    await writeFiles(profile, { "work/a.md": "a\n" });
    const store = new FolderDefinitionStore(join(profile, "work"), undefined, { fence: profile });
    await expect(store.list()).rejects.toThrow(RangeError);
    await expect(store.read("a.md")).rejects.toThrow(RangeError);
    await expect(store.write("b.md", "b\n")).rejects.toThrow(RangeError);
  });

  it("finds the profile through a link to the workspace", async () => {
    const root = await tempFolder();
    const elsewhere = await tempFolder();
    const link = join(elsewhere, "home");
    await symlink(root, link, "dir");
    const store = new FolderDefinitionStore(link, undefined, { fence: join(root, "profile") });
    await expect(store.write("profile/trust/x.json", "{}")).rejects.toThrow(RangeError);
  });

  it("works out where the fenced folder is", async () => {
    const root = await tempFolder();
    const outside = await tempFolder();
    expect(await fenceAround(root, outside)).toEqual({ kind: "outside" });
    expect(await fenceAround(root, root)).toEqual({ kind: "whole" });
    const fence = await fenceAround(root, join(root, ".Local", "share", "halonic"));
    expect(fence).toEqual({ kind: "at", segments: [".local", "share", "halonic"] });
    expect(fenceHolds(fence, "")).toBe(false);
    expect(fenceHolds(fence, ".local/share")).toBe(false);
    expect(fenceHolds(fence, ".local/share/halonic")).toBe(true);
    expect(fenceHolds(fence, ".LOCAL/share/halonic./trust")).toBe(true);
    expect(fenceHolds(fence, ".local/share/halonic-old")).toBe(false);
  });

  describe("watch", () => {
    it("doesn't report a change in the profile", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const root = await tempFolder();
      await writeFiles(root, { "a.yaml": "1" });
      let notice: (name: string) => void = () => {};
      const store = new FolderDefinitionStore(root, undefined, {
        fence: join(root, "profile"),
        quietMs: 100,
        events: (_root, noticed) => {
          notice = noticed;
          return () => {};
        },
      });
      const batches: (readonly WorkspaceFileChange[])[] = [];
      const read = vi.spyOn(store, "read");
      const watch: DefinitionWatch = await store.watch({
        changed: (changes) => batches.push(changes),
        failed: (error) => {
          throw error;
        },
      });
      read.mockClear();
      await writeFiles(root, { "profile/trust/x.json": "{}" });
      notice("profile");
      notice("profile/trust/x.json");
      await vi.advanceTimersByTimeAsync(100);
      await watch.close();
      expect(batches).toEqual([]);
      expect(read).not.toHaveBeenCalled();
    });
  });
});
