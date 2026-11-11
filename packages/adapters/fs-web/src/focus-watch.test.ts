import type { WorkspaceFileChange } from "@halonicjs/ports";
import { contentDigest, type Sha256 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserFolderDefinitionStore } from "./definition-store.ts";
import { FakeDisk } from "./fake-folder.test-helper.ts";
import type { PageReturns } from "./focus-events.ts";
import { isFolderAccessError } from "./folder-access.ts";

const quietMs = 50;

const webCryptoDigest: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** The person coming back to the page, by hand. */
function handReturns() {
  const returned = new Set<() => void>();
  const pageReturns: PageReturns = (onReturn) => {
    returned.add(onReturn);
    return () => returned.delete(onReturn);
  };
  return {
    pageReturns,
    listening: () => returned.size > 0,
    comeBack: () => {
      for (const onReturn of returned) onReturn();
    },
  };
}

/** A fake folder holding `files`, a store over it and an open watch that keeps every batch. */
async function watched(files: Record<string, string>) {
  const disk = new FakeDisk(files);
  const hand = handReturns();
  const store = new BrowserFolderDefinitionStore(disk.root, {
    pageReturns: hand.pageReturns,
    quietMs,
  });
  const batches: (readonly WorkspaceFileChange[])[] = [];
  const failures: Error[] = [];
  const watch = await store.watch({
    changed: (changes) => batches.push(changes),
    failed: (error) => failures.push(error),
  });
  /** The person comes back; waits for the check and the quiet pause, then for the batch. */
  const comeBack = async (): Promise<void> => {
    hand.comeBack();
    // The check walks the fake folder in promises only; one turn of the event loop finishes it.
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(quietMs);
  };
  return { disk, hand, store, watch, batches, failures, comeBack };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("fs-web.focus-watch", () => {
  describe("BrowserFolderDefinitionStore.watch", () => {
    it("reports what another program changed when the person comes back", async () => {
      const { disk, batches, comeBack, watch } = await watched({ "a.yaml": "1", "b/c.yaml": "1" });
      disk.writeOutside("b/c.yaml", "2");
      disk.writeOutside("d.yaml", "new");
      disk.removeOutside("a.yaml");
      expect(batches).toEqual([]);
      await comeBack();
      await watch.close();
      expect(batches).toEqual([
        [
          { path: "a.yaml", kind: "removed" },
          { path: "b/c.yaml", kind: "changed" },
          { path: "d.yaml", kind: "changed" },
        ],
      ]);
    });

    it("reads only the files whose time or size moved", async () => {
      const { disk, batches, comeBack, watch } = await watched({
        "a.yaml": "1",
        "b.yaml": "1",
        "c.yaml": "1",
      });
      disk.reads.length = 0;
      disk.writeOutside("b.yaml", "2");
      await comeBack();
      await watch.close();
      expect(batches).toEqual([[{ path: "b.yaml", kind: "changed" }]]);
      expect(new Set(disk.reads)).toEqual(new Set(["b.yaml"]));
    });

    it("leaves out a file saved again with the same text", async () => {
      const { disk, batches, comeBack, watch } = await watched({ "a.yaml": "1" });
      disk.writeOutside("a.yaml", "1");
      await comeBack();
      await watch.close();
      expect(batches).toEqual([]);
    });

    it("never reports the store's own writes and removes", async () => {
      const { store, batches, comeBack, watch } = await watched({ "a.yaml": "1", "b.yaml": "1" });
      await store.write("a.yaml", "2");
      await store.write("hubs/c.yaml", "new");
      await store.remove("b.yaml");
      await comeBack();
      await watch.close();
      expect(batches).toEqual([]);
    });

    it("reports a change from outside that a write found while it was pending", async () => {
      const { disk, store, batches, comeBack, watch } = await watched({ "a.yaml": "1" });
      disk.onWriteOpened = async () => {
        disk.writeOutside("a.yaml", "3");
      };
      const expected = await contentDigest("1", webCryptoDigest);
      expect(await store.write("a.yaml", "2", { expected })).toEqual({
        status: "changed-on-disk",
        current: "3",
      });
      await comeBack();
      await watch.close();
      expect(batches).toEqual([[{ path: "a.yaml", kind: "changed" }]]);
    });

    it("checks once when focus and visibility come back together", async () => {
      const { disk, hand, batches, comeBack, watch } = await watched({ "a.yaml": "1" });
      disk.writeOutside("a.yaml", "2");
      hand.comeBack();
      await comeBack();
      await watch.close();
      expect(batches).toEqual([[{ path: "a.yaml", kind: "changed" }]]);
    });

    it("tells the listener once when access is gone, and reports nothing more", async () => {
      const { disk, batches, failures, comeBack, hand } = await watched({ "a.yaml": "1" });
      disk.refuseCalls = true;
      await comeBack();
      expect(failures).toHaveLength(1);
      expect(isFolderAccessError(failures[0])).toBe(true);
      expect(hand.listening()).toBe(false);
      disk.refuseCalls = false;
      disk.writeOutside("a.yaml", "2");
      await comeBack();
      expect(batches).toEqual([]);
      expect(failures).toHaveLength(1);
    });

    it("goes on when a file is gone by the time the check looks at it", async () => {
      const { disk, batches, comeBack, watch } = await watched({ "a.yaml": "1", "b.yaml": "1" });
      disk.removeOutside("a.yaml");
      disk.writeOutside("b.yaml", "2");
      disk.failOnce("getFile", "b.yaml", "NotFoundError");
      await comeBack();
      await watch.close();
      // `b.yaml` counts as gone for the check, so the watch reads it, and finds it changed.
      expect(batches).toEqual([
        [
          { path: "a.yaml", kind: "removed" },
          { path: "b.yaml", kind: "changed" },
        ],
      ]);
    });

    it("tells the listener when the check fails for another reason", async () => {
      const { disk, failures, comeBack } = await watched({ "a.yaml": "1" });
      disk.failOnce("getFile", "a.yaml", "NotReadableError");
      await comeBack();
      expect(failures).toEqual([expect.objectContaining({ name: "NotReadableError" })]);
    });

    it("stops listening when closed", async () => {
      const { disk, batches, comeBack, hand, watch } = await watched({ "a.yaml": "1" });
      await watch.close();
      expect(hand.listening()).toBe(false);
      disk.writeOutside("a.yaml", "2");
      await comeBack();
      expect(batches).toEqual([]);
    });
  });
});
