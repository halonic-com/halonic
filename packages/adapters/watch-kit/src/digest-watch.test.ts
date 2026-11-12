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

    describe("asks the store once per path, as each call can be a round trip to the shell", () => {
      /** The store calls a batch for `names` makes, after the watch opened. */
      async function callsFor(
        files: Record<string, string>,
        change: (store: MemoryDefinitionStore) => Promise<unknown>,
        ...names: string[]
      ) {
        const { store, hand, batches, settle } = await watched(files);
        await change(store);
        const read = vi.spyOn(store, "read");
        const list = vi.spyOn(store, "list");
        hand.notice(...names);
        await settle();
        return {
          batches,
          reads: read.mock.calls.map(([path]) => path).sort(),
          lists: list.mock.calls.map(([dir]) => dir),
        };
      }

      it("reads a changed file once, without listing it", async () => {
        const calls = await callsFor(
          { "a.yaml": "1" },
          (store) => store.write("a.yaml", "2"),
          "a.yaml",
        );
        expect(calls).toEqual({
          batches: [[{ path: "a.yaml", kind: "changed" }]],
          reads: ["a.yaml"],
          lists: [],
        });
      });

      it("reads a removed file once, and lists it once in case it became a folder", async () => {
        const calls = await callsFor(
          { "a.yaml": "1" },
          (store) => store.remove("a.yaml"),
          "a.yaml",
        );
        expect(calls).toEqual({
          batches: [[{ path: "a.yaml", kind: "removed" }]],
          reads: ["a.yaml"],
          lists: ["a.yaml"],
        });
      });

      it("reads a changed folder's name and each file under it once, and lists it once", async () => {
        const calls = await callsFor(
          { "hubs/a/hub.yaml": "1", "hubs/a/x.yaml": "1" },
          (store) => store.write("hubs/a/hub.yaml", "2"),
          "hubs/a",
        );
        expect(calls).toEqual({
          batches: [[{ path: "hubs/a/hub.yaml", kind: "changed" }]],
          reads: ["hubs/a", "hubs/a/hub.yaml", "hubs/a/x.yaml"],
          lists: ["hubs/a"],
        });
      });

      it("reads a path named twice in one batch once", async () => {
        const calls = await callsFor(
          { "hubs/a/hub.yaml": "1" },
          (store) => store.write("hubs/a/hub.yaml", "2"),
          "hubs/a",
          "hubs/a/hub.yaml",
        );
        expect(calls).toEqual({
          batches: [[{ path: "hubs/a/hub.yaml", kind: "changed" }]],
          reads: ["hubs/a", "hubs/a/hub.yaml"],
          lists: ["hubs/a"],
        });
      });
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

    it("takes the store's write as seen, so a change from outside right after it is reported", async () => {
      const { store, hand, watch, batches, settle } = await watched({ "a.yaml": "1" });
      watch.beginOwnChange("a.yaml", await contentDigest("2", webCryptoDigest));
      await store.write("a.yaml", "2");
      // Another program writes before the store has finished its own change.
      await store.write("a.yaml", "from an editor");
      await watch.endOwnChange("a.yaml", true);
      hand.notice("a.yaml");
      await settle();
      expect(batches).toEqual([[{ path: "a.yaml", kind: "changed" }]]);
    });

    it("reads a failed own change back in turn with the batches, never over a newer one", async () => {
      const { store, hand, watch, batches, settle } = await watched({ "a.yaml": "1" });
      const read = store.read.bind(store);
      const slowRead = Promise.withResolvers<void>();
      // The read-back of the failed write sees "1", but answers late.
      vi.spyOn(store, "read").mockImplementationOnce(async (path) => {
        const text = await read(path);
        await slowRead.promise;
        return text;
      });
      watch.beginOwnChange("a.yaml", await contentDigest("2", webCryptoDigest));
      const ending = watch.endOwnChange("a.yaml", false);
      await store.write("a.yaml", "3");
      hand.notice("a.yaml");
      await vi.advanceTimersByTimeAsync(quietMs);
      slowRead.resolve();
      await ending;
      // Nothing changed since: the watch must still know the file holds "3".
      hand.notice("a.yaml");
      await settle();
      expect(batches).toEqual([[{ path: "a.yaml", kind: "changed" }]]);
    });

    it("is told about the store's own changes while it reads the workspace on opening", async () => {
      const store = new MemoryDefinitionStore({ "a.yaml": "1" });
      const hand = handEvents();
      const openWatches = new Set<DigestWatch>();
      const batches: (readonly WorkspaceFileChange[])[] = [];
      const read = store.read.bind(store);
      const slowRead = Promise.withResolvers<void>();
      // The first listing sees "1", but answers after the store's write.
      vi.spyOn(store, "read").mockImplementationOnce(async (path) => {
        const text = await read(path);
        await slowRead.promise;
        return text;
      });
      const opening = DigestWatch.open(
        { files: store, digest: webCryptoDigest, events: hand.events, quietMs, openWatches },
        { changed: (changes) => batches.push(changes), failed: () => {} },
      );
      await vi.advanceTimersByTimeAsync(0);
      // The store writes as it would, telling every open watch.
      const own = await contentDigest("2", webCryptoDigest);
      const watches = [...openWatches];
      for (const watch of watches) watch.beginOwnChange("a.yaml", own);
      await store.write("a.yaml", "2");
      const endings = watches.map((watch) => watch.endOwnChange("a.yaml", true));
      slowRead.resolve();
      await Promise.all(endings);
      const watch = await opening;
      hand.notice("a.yaml");
      await vi.advanceTimersByTimeAsync(quietMs);
      await watch.close();
      expect(watches).toEqual([watch]);
      expect(batches).toEqual([]);
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

    it("breaks the watch, not the store's write, when reading a failed write back fails", async () => {
      const { store, watch, failures } = await watched({ "a.yaml": "1" });
      const readFailure = new Error("the disk stopped answering");
      vi.spyOn(store, "read").mockRejectedValueOnce(readFailure);
      await expect(watch.endOwnChange("a.yaml", false)).resolves.toBeUndefined();
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
