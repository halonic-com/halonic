import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { WorkspaceFileChange } from "@halonicjs/ports";
import type { Sha256 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DigestWatch } from "./digest-watch.ts";
import { runOwnChange } from "./own-change.ts";

const quietMs = 50;

const webCryptoDigest: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** A memory workspace with an open watch on it, which checks every file when told to. */
async function watched(files: Record<string, string>) {
  const store = new MemoryDefinitionStore(files);
  const openWatches = new Set<DigestWatch>();
  const batches: (readonly WorkspaceFileChange[])[] = [];
  let noticed: (name: string) => void = () => {};
  const watch = await DigestWatch.open(
    {
      files: store,
      digest: webCryptoDigest,
      events: (onNoticed) => {
        noticed = onNoticed;
        return () => {};
      },
      quietMs,
      openWatches,
    },
    { changed: (changes) => batches.push(changes), failed: () => {} },
  );
  /** Checks every file, then waits for the batch. */
  const check = async (): Promise<void> => {
    noticed("");
    await vi.advanceTimersByTimeAsync(quietMs);
    await watch.close();
  };
  return { store, openWatches, batches, check };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("watch-kit.own-change", () => {
  describe("runOwnChange", () => {
    it("keeps the store's change from being reported", async () => {
      const { store, openWatches, batches, check } = await watched({
        "a.yaml": "1",
        "b.yaml": "1",
      });
      const applied = await runOwnChange(openWatches, "a.yaml", "2", webCryptoDigest, async () => {
        await store.write("a.yaml", "2");
        return true;
      });
      await runOwnChange(openWatches, "b.yaml", null, webCryptoDigest, async () => {
        await store.remove("b.yaml");
        return true;
      });
      expect(applied).toBe(true);
      await check();
      expect(batches).toEqual([]);
    });

    it("still reports the change from outside a store's change found and left alone", async () => {
      const { store, openWatches, batches, check } = await watched({ "a.yaml": "1" });
      const applied = await runOwnChange(openWatches, "a.yaml", "2", webCryptoDigest, async () => {
        await store.write("a.yaml", "another program won");
        return false;
      });
      expect(applied).toBe(false);
      await check();
      expect(batches).toEqual([[{ path: "a.yaml", kind: "changed" }]]);
    });

    it("reads a change that threw back, and lets its error go on", async () => {
      const { store, openWatches, batches, check } = await watched({ "a.yaml": "1" });
      const failure = new Error("the disk is full");
      const running = runOwnChange(openWatches, "a.yaml", "2", webCryptoDigest, async () => {
        // It landed halfway: what is there now is the store's doing, not news.
        await store.write("a.yaml", "half");
        throw failure;
      });
      await expect(running).rejects.toBe(failure);
      await check();
      expect(batches).toEqual([]);
    });

    it("works out no digest when no watch is open", async () => {
      const digest = { sha256: vi.fn(webCryptoDigest.sha256) };
      const apply = vi.fn(async () => true);
      expect(await runOwnChange(new Set(), "a.yaml", "2", digest, apply)).toBe(true);
      expect(apply).toHaveBeenCalledOnce();
      expect(digest.sha256).not.toHaveBeenCalled();
    });
  });
});
