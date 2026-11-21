import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { WorkspaceFileChange } from "@halonicjs/ports";
import type { Sha256 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DigestWatch, type WatchEvents } from "./digest-watch.ts";

const quietMs = 50;

const webCryptoDigest: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

/** A memory workspace with `files`, its reads counted, and a watch leaving out `node_modules`. */
async function watchedLeavingOut(files: Record<string, string>) {
  const store = new MemoryDefinitionStore(files);
  const read = vi.spyOn(store, "read");
  let noticed: (name: string) => void = () => {};
  const events: WatchEvents = (onNoticed) => {
    noticed = onNoticed;
    return () => {};
  };
  const batches: (readonly WorkspaceFileChange[])[] = [];
  const watch = await DigestWatch.open(
    {
      files: store,
      digest: webCryptoDigest,
      events,
      quietMs,
      openWatches: new Set(),
      leaveOut: { names: ["node_modules"] },
    },
    { changed: (changes) => batches.push(changes), failed: () => {} },
  );
  const settle = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(quietMs);
    await watch.close();
  };
  return { store, read, notice: (name: string) => noticed(name), batches, settle };
}

/** The paths the store was asked to read. */
function readPaths(read: { mock: { calls: unknown[][] } }): unknown[] {
  return read.mock.calls.map(([path]) => path);
}

verifies("watch-kit.digest-watch-left-out", () => {
  it("never reads a left-out file when it opens", async () => {
    const { read, settle } = await watchedLeavingOut({
      "tools/node_modules/x.js": "x\n",
      "workspace.yaml": "id: a\n",
    });
    await settle();
    expect(readPaths(read)).toEqual(["workspace.yaml"]);
  });

  it("neither reads nor reports a change under a left-out folder", async () => {
    const { store, read, notice, batches, settle } = await watchedLeavingOut({
      "node_modules/x.js": "x\n",
      "workspace.yaml": "id: a\n",
    });
    await store.write("node_modules/x.js", "y\n");
    await store.write("node_modules/new.js", "n\n");
    await store.write("workspace.yaml", "id: b\n");
    read.mockClear();
    notice("node_modules/x.js");
    notice("Node_Modules");
    notice("");
    await settle();
    expect(batches).toEqual([[{ path: "workspace.yaml", kind: "changed" }]]);
    expect(readPaths(read)).toEqual(["workspace.yaml"]);
  });
});
