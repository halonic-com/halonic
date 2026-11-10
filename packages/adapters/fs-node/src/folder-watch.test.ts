import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DefinitionWatch, WorkspaceFileChange } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderDefinitionStore } from "./definition-store.ts";
import type { FolderEvents } from "./folder-watch.ts";
import { removeTempFolders, tempFolder, writeFiles } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const quietMs = 100;

/** Events a test sends by hand, in place of `node:fs.watch`. */
function handEvents(): {
  events: FolderEvents;
  notice: (...names: string[]) => void;
  fail: (error: Error) => void;
} {
  let noticed: (name: string) => void = () => {};
  let failed: (error: Error) => void = () => {};
  return {
    events: (_root, onNoticed, onFailed) => {
      noticed = onNoticed;
      failed = onFailed;
      return () => {
        noticed = () => {};
      };
    },
    notice: (...names) => {
      for (const name of names) noticed(name);
    },
    fail: (error) => failed(error),
  };
}

/** A folder with `files`, its store on hand-sent events, and an open watch that keeps every batch. */
async function watched(files: Record<string, string>) {
  const root = await tempFolder();
  await writeFiles(root, files);
  const hand = handEvents();
  const store = new FolderDefinitionStore(root, undefined, { events: hand.events, quietMs });
  const batches: (readonly WorkspaceFileChange[])[] = [];
  const failures: Error[] = [];
  const watch: DefinitionWatch = await store.watch({
    changed: (changes) => batches.push(changes),
    failed: (error) => failures.push(error),
  });
  /** Lets the quiet pause pass, then waits for the batch to be read. */
  const settle = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(quietMs);
    await watch.close();
  };
  return { root, store, hand, batches, failures, watch, settle };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("ports.definition-store-watch", () => {
  describe("folder watch", () => {
    it("reports a checkout that touches 50 files as one batch", async () => {
      const files = Object.fromEntries(
        Array.from({ length: 50 }, (_, index) => [`agents/a${index}.agent.yaml`, "v: 1\n"]),
      );
      const { root, hand, batches, settle } = await watched(files);
      for (const path of Object.keys(files)) {
        await writeFile(join(root, path), "v: 2\n", "utf8");
        hand.notice(path.replace("/", "\\"));
        await vi.advanceTimersByTimeAsync(quietMs / 2);
      }
      await settle();
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(50);
      expect(batches[0]?.every((change) => change.kind === "changed")).toBe(true);
    });

    it("doesn't report its own writes, but does report another program's", async () => {
      const { root, store, hand, batches, settle } = await watched({
        "a.yaml": "1",
        "b.yaml": "1",
      });
      await store.write("a.yaml", "2");
      await store.remove("b.yaml");
      await writeFile(join(root, "c.yaml"), "from an editor", "utf8");
      hand.notice("a.yaml", "b.yaml", "c.yaml");
      await settle();
      expect(batches).toEqual([[{ path: "c.yaml", kind: "changed" }]]);
    });

    it("reports a file removed and created again as changed", async () => {
      const { root, hand, batches, settle } = await watched({ "a.yaml": "1" });
      await rm(join(root, "a.yaml"));
      hand.notice("a.yaml");
      await writeFile(join(root, "a.yaml"), "2", "utf8");
      hand.notice("a.yaml");
      await settle();
      expect(batches).toEqual([[{ path: "a.yaml", kind: "changed" }]]);
    });

    it("reports nothing for a file saved again with the same text", async () => {
      const { root, hand, batches, settle } = await watched({ "a.yaml": "1" });
      await writeFile(join(root, "a.yaml"), "1", "utf8");
      hand.notice("a.yaml");
      await settle();
      expect(batches).toEqual([]);
    });

    it("leaves out private entries and temporary writes", async () => {
      const { root, hand, batches, settle } = await watched({ "a.yaml": "1" });
      await writeFiles(root, {
        ".git/index": "x",
        ".studio/runs/r1.jsonl": "{}",
        ".env": "A=1",
        ".halonic-write-0b5e.tmp": "half",
      });
      hand.notice(".git", ".git/index", ".studio/runs/r1.jsonl", ".env", ".halonic-write-0b5e.tmp");
      await settle();
      expect(batches).toEqual([]);
    });

    it("reports every file of a folder that went away or arrived", async () => {
      const { root, hand, batches, settle } = await watched({
        "hubs/a/hub.yaml": "id: a\n",
        "hubs/a/agents/x.agent.yaml": "id: x\n",
      });
      await rm(join(root, "hubs/a"), { recursive: true });
      await writeFiles(root, { "hubs/b/hub.yaml": "id: b\n" });
      hand.notice("hubs/a", "hubs/b");
      await settle();
      expect(batches).toEqual([
        [
          { path: "hubs/a/agents/x.agent.yaml", kind: "removed" },
          { path: "hubs/a/hub.yaml", kind: "removed" },
          { path: "hubs/b/hub.yaml", kind: "changed" },
        ],
      ]);
    });

    it("reports the files of a folder that became a link as removed, and keeps watching", async () => {
      const { root, hand, batches, failures, settle } = await watched({
        "hubs/a/hub.yaml": "id: a\n",
        "elsewhere/hub.yaml": "id: elsewhere\n",
      });
      await rm(join(root, "hubs/a"), { recursive: true });
      await symlink(join(root, "elsewhere"), join(root, "hubs/a"), "dir");
      hand.notice("hubs/a");
      await settle();
      expect(failures).toEqual([]);
      expect(batches).toEqual([[{ path: "hubs/a/hub.yaml", kind: "removed" }]]);
    });

    it("doesn't fail a finished write when reading it back fails; the watch is told", async () => {
      const { store, failures } = await watched({ "a.yaml": "1" });
      const readFailure = new Error("the disk stopped answering");
      vi.spyOn(store, "read").mockRejectedValueOnce(readFailure);
      await expect(store.write("a.yaml", "2")).resolves.toEqual({ status: "written" });
      expect(failures).toEqual([readFailure]);
    });

    it("checks every file when an event names none", async () => {
      const { root, hand, batches, settle } = await watched({ "a.yaml": "1", "b/c.yaml": "1" });
      await writeFile(join(root, "b/c.yaml"), "2", "utf8");
      hand.notice("");
      await settle();
      expect(batches).toEqual([[{ path: "b/c.yaml", kind: "changed" }]]);
    });

    it("reports nothing once closed", async () => {
      const { root, hand, batches, watch } = await watched({ "a.yaml": "1" });
      await watch.close();
      await writeFile(join(root, "a.yaml"), "2", "utf8");
      hand.notice("a.yaml");
      await vi.advanceTimersByTimeAsync(quietMs);
      expect(batches).toEqual([]);
    });

    it("tells the listener when the watch breaks, and reports nothing after", async () => {
      const { root, hand, batches, failures } = await watched({ "a.yaml": "1" });
      hand.fail(new Error("the folder went away"));
      await writeFile(join(root, "a.yaml"), "2", "utf8");
      hand.notice("a.yaml");
      await vi.advanceTimersByTimeAsync(quietMs);
      expect(failures.map((error) => error.message)).toEqual(["the folder went away"]);
      expect(batches).toEqual([]);
    });
  });
});

verifies("fs-node.watch-folder", () => {
  it("hears another program's change through node:fs.watch", async () => {
    vi.useRealTimers();
    const root = await tempFolder();
    await mkdir(join(root, "hubs/a"), { recursive: true });
    const store = new FolderDefinitionStore(root, undefined, { quietMs: 20 });
    let watch: DefinitionWatch | undefined;
    try {
      const firstBatch = new Promise<readonly WorkspaceFileChange[]>((resolve, reject) => {
        void store
          .watch({ changed: resolve, failed: reject })
          .then(async (opened) => {
            watch = opened;
            await writeFile(join(root, "hubs/a/hub.yaml"), "id: a\n", "utf8");
          })
          .catch(reject);
      });
      expect(await firstBatch).toEqual([{ path: "hubs/a/hub.yaml", kind: "changed" }]);
    } finally {
      await watch?.close();
    }
  });
});
