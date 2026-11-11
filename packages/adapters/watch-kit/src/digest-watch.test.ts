import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { WorkspaceFileChange } from "@halonicjs/ports";
import { contentDigest, type Sha256 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DigestWatch, type WatchEvents } from "./digest-watch.ts";

const quietMs = 50;

const webCryptoDigest: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** Events a test sends by hand, in place of a store's real source. */
function handEvents() {
  let noticed: (name: string) => void = () => {};
  let failed: (error: Error) => void = () => {};
  let listening = false;
  const events: WatchEvents = (onNoticed, onFailed) => {
    noticed = onNoticed;
    failed = onFailed;
    listening = true;
    return () => {
      listening = false;
    };
  };
  return {
    events,
    listening: () => listening,
    notice: (...names: string[]) => {
      for (const name of names) noticed(name);
    },
    fail: (error: Error) => failed(error),
  };
}

/** A memory workspace with `files`, and an open watch on it that keeps every batch. */
async function watched(files: Record<string, string>, isScratch?: (name: string) => boolean) {
  const store = new MemoryDefinitionStore(files);
  const hand = handEvents();
  const openWatches = new Set<DigestWatch>();
  const batches: (readonly WorkspaceFileChange[])[] = [];
  const failures: Error[] = [];
  const watch = await DigestWatch.open(
    {
      files: store,
      digest: webCryptoDigest,
      events: hand.events,
      quietMs,
      openWatches,
      ...(isScratch === undefined ? {} : { isScratch }),
    },
    { changed: (changes) => batches.push(changes), failed: (error) => failures.push(error) },
  );
  /** Lets the quiet pause pass, then waits for the batch to be read. */
  const settle = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(quietMs);
    await watch.close();
  };
  return { store, hand, openWatches, batches, failures, watch, settle };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("watch-kit.digest-watch", () => {
  describe("DigestWatch", () => {
    it("checks every file when the source names none", async () => {
      const { store, hand, batches, settle } = await watched({ "a.yaml": "1", "b/c.yaml": "1" });
      await store.write("b/c.yaml", "2");
      hand.notice("");
      await settle();
      expect(batches).toEqual([[{ path: "b/c.yaml", kind: "changed" }]]);
    });

    it("gathers names until the source is quiet, and reports one sorted batch", async () => {
      const { store, hand, batches, settle } = await watched({ "a.yaml": "1", "b.yaml": "1" });
      await store.write("b.yaml", "2");
      hand.notice("b.yaml");
      await vi.advanceTimersByTimeAsync(quietMs / 2);
      await store.remove("a.yaml");
      hand.notice("a.yaml");
      await settle();
      expect(batches).toEqual([
        [
          { path: "a.yaml", kind: "removed" },
          { path: "b.yaml", kind: "changed" },
        ],
      ]);
    });

    it("reports every file under a folder name, and nothing for unchanged text", async () => {
      const { store, hand, batches, settle } = await watched({
        "hubs/a/hub.yaml": "id: a\n",
        "hubs/a/agents/x.agent.yaml": "id: x\n",
      });
      await store.remove("hubs/a/hub.yaml");
      await store.write("hubs/a/agents/x.agent.yaml", "id: x\n");
      await store.write("hubs/a/agents/y.agent.yaml", "id: y\n");
      hand.notice("hubs/a");
      await settle();
      expect(batches).toEqual([
        [
          { path: "hubs/a/agents/y.agent.yaml", kind: "changed" },
          { path: "hubs/a/hub.yaml", kind: "removed" },
        ],
      ]);
    });

    it("leaves out the store's own change, but not another one next to it", async () => {
      const { store, hand, watch, batches, settle } = await watched({
        "a.yaml": "1",
        "b.yaml": "1",
      });
      watch.beginOwnChange("a.yaml", await contentDigest("2", webCryptoDigest));
      await store.write("a.yaml", "2");
      await store.write("b.yaml", "from an editor");
      // The batch is read while the store's change is still in progress.
      hand.notice("a.yaml", "b.yaml");
      await settle();
      expect(batches).toEqual([[{ path: "b.yaml", kind: "changed" }]]);
    });

    it("reports a file that differs from the store's own change", async () => {
      const { store, hand, watch, batches, settle } = await watched({ "a.yaml": "1" });
      watch.beginOwnChange("a.yaml", "absent");
      await store.write("a.yaml", "another program won");
      hand.notice("a.yaml");
      await settle();
      expect(batches).toEqual([[{ path: "a.yaml", kind: "changed" }]]);
    });

    it("ignores private entries and scratch files without reading the workspace", async () => {
      const isScratch = (name: string) => name.endsWith(".tmp");
      const { store, hand, batches, settle } = await watched({ "a.yaml": "1" }, isScratch);
      const list = vi.spyOn(store, "list");
      hand.notice(".git/index", ".env");
      hand.notice("half.tmp");
      await settle();
      expect(batches).toEqual([]);
      expect(list).not.toHaveBeenCalled();
    });

    it("treats a path the store refuses as having no file", async () => {
      const { store, hand, batches, failures, settle } = await watched({ "hubs/a/hub.yaml": "1" });
      vi.spyOn(store, "read").mockRejectedValue(new RangeError("a link"));
      vi.spyOn(store, "list").mockRejectedValue(new RangeError("a link"));
      hand.notice("hubs/a");
      await settle();
      expect(failures).toEqual([]);
      expect(batches).toEqual([[{ path: "hubs/a/hub.yaml", kind: "removed" }]]);
    });

    it("tells the listener once when reading a batch fails, and reports nothing after", async () => {
      const { store, hand, openWatches, watch, batches, failures } = await watched({
        "a.yaml": "1",
      });
      const readFailure = new Error("the disk stopped answering");
      vi.spyOn(store, "read").mockRejectedValueOnce(readFailure);
      hand.notice("a.yaml");
      await vi.advanceTimersByTimeAsync(quietMs);
      await store.write("a.yaml", "2");
      hand.notice("a.yaml");
      await vi.advanceTimersByTimeAsync(quietMs);
      await watch.close();
      expect(failures).toEqual([readFailure]);
      expect(batches).toEqual([]);
      expect(openWatches.size).toBe(0);
      expect(hand.listening()).toBe(false);
    });

    it("tells the listener when the source fails", async () => {
      const { hand, openWatches, failures } = await watched({ "a.yaml": "1" });
      hand.fail(new Error("the folder went away"));
      expect(failures.map((error) => error.message)).toEqual(["the folder went away"]);
      expect(openWatches.size).toBe(0);
    });

    it("breaks the watch, not the store's write, when reading the write back fails", async () => {
      const { store, watch, failures } = await watched({ "a.yaml": "1" });
      const readFailure = new Error("the disk stopped answering");
      vi.spyOn(store, "read").mockRejectedValueOnce(readFailure);
      await expect(watch.endOwnChange("a.yaml")).resolves.toBeUndefined();
      expect(failures).toEqual([readFailure]);
    });

    it("stops listening when the workspace can't be read on opening", async () => {
      const store = new MemoryDefinitionStore();
      const hand = handEvents();
      const openWatches = new Set<DigestWatch>();
      const listFailure = new Error("the disk stopped answering");
      vi.spyOn(store, "list").mockRejectedValueOnce(listFailure);
      const opening = DigestWatch.open(
        { files: store, digest: webCryptoDigest, events: hand.events, quietMs, openWatches },
        { changed: () => {}, failed: () => {} },
      );
      await expect(opening).rejects.toBe(listFailure);
      expect(hand.listening()).toBe(false);
      expect(openWatches.size).toBe(0);
    });
  });
});
