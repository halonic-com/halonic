import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { isUnreadableWorkspaceFolderError, type WorkspaceFileChange } from "@halonicjs/ports";
import { definitionSourceLeftOutContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { FolderDefinitionStore } from "./definition-store.ts";
import type { FolderEvents } from "./folder-watch.ts";
import { removeTempFolders, tempFolder, writeFiles } from "./temp-folder.test-helper.ts";

/** Permission bits on a file or folder: Windows ignores `chmod` there (HAL-4365). */
const itUnlessWindows = it.skipIf(process.platform === "win32");

const quietMs = 100;

afterAll(removeTempFolders);

definitionSourceLeftOutContract("folder", async (files) => {
  const root = await tempFolder();
  await writeFiles(root, files);
  return new FolderDefinitionStore(root);
});

verifies("fs-node.definition-store-left-out", () => {
  itUnlessWindows(
    "[platform:win32] chmod can't lock a folder there: never steps into a left-out folder",
    async () => {
      const root = await tempFolder();
      await writeFiles(root, { "repo/locked/a.ts": "a\n", "workspace.yaml": "id: acme\n" });
      const store = new FolderDefinitionStore(root);
      await chmod(join(root, "repo/locked"), 0o000);
      try {
        expect(await store.list(undefined, { leaveOut: { folders: ["repo"] } })).toEqual([
          "workspace.yaml",
        ]);
        // Without the option the same walk reaches the locked folder and says so.
        const error = await store.list().catch((caught: unknown) => caught);
        expect(isUnreadableWorkspaceFolderError(error)).toBe(true);
      } finally {
        await chmod(join(root, "repo/locked"), 0o700);
      }
    },
  );

  it("gives nothing for a left-out folder it is asked to list", async () => {
    const root = await tempFolder();
    await writeFiles(root, { "repo/a.ts": "a\n" });
    const store = new FolderDefinitionStore(root);
    expect(await store.list("repo", { leaveOut: { folders: ["repo"] } })).toEqual([]);
    expect(await store.list("repo", { leaveOut: { folders: ["REPO"] } })).toEqual([]);
  });

  it("gives the memory store's version for the same files and option", async () => {
    const files = { "repo/a.ts": "a\n", "node_modules/x.js": "x\n", "workspace.yaml": "id: a\n" };
    const root = await tempFolder();
    await writeFiles(root, files);
    const leaveOut = { folders: ["repo"], names: ["node_modules"] };
    expect(await new FolderDefinitionStore(root).version({ leaveOut })).toBe(
      await new MemoryDefinitionStore(files).version({ leaveOut }),
    );
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Events a test sends by hand, in place of `node:fs.watch`. */
function handEvents(): { events: FolderEvents; notice: (name: string) => void } {
  let noticed: (name: string) => void = () => {};
  return {
    events: (_root, onNoticed) => {
      noticed = onNoticed;
      return () => {
        noticed = () => {};
      };
    },
    notice: (name) => noticed(name),
  };
}

verifies("fs-node.watch-folder", () => {
  itUnlessWindows(
    "[platform:win32] chmod can't lock a file there: opens without reading a file under node_modules",
    async () => {
      const root = await tempFolder();
      await writeFiles(root, { "tools/node_modules/x.js": "x\n", "workspace.yaml": "id: a\n" });
      await chmod(join(root, "tools/node_modules/x.js"), 0o000);
      try {
        const store = new FolderDefinitionStore(root, undefined, { events: handEvents().events });
        // Reading the locked file would reject with EACCES.
        const opened = store.watch({ changed: () => {}, failed: () => {} });
        await expect(opened.then((watch) => watch.close())).resolves.toBeUndefined();
      } finally {
        await chmod(join(root, "tools/node_modules/x.js"), 0o600);
      }
    },
  );

  it("reports no change under node_modules", async () => {
    const root = await tempFolder();
    await writeFiles(root, { "node_modules/x.js": "x\n", "workspace.yaml": "id: a\n" });
    const hand = handEvents();
    const store = new FolderDefinitionStore(root, undefined, { events: hand.events, quietMs });
    const batches: (readonly WorkspaceFileChange[])[] = [];
    const watch = await store.watch({
      changed: (changes) => batches.push(changes),
      failed: () => {},
    });
    await writeFile(join(root, "node_modules/x.js"), "y\n", "utf8");
    await writeFile(join(root, "node_modules/new.js"), "n\n", "utf8");
    await writeFile(join(root, "workspace.yaml"), "id: b\n", "utf8");
    hand.notice("node_modules/x.js");
    hand.notice("node_modules");
    hand.notice("");
    await vi.advanceTimersByTimeAsync(quietMs);
    await watch.close();
    expect(batches).toEqual([[{ path: "workspace.yaml", kind: "changed" }]]);
  });
});
