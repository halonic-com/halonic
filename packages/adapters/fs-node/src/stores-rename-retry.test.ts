import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunEvent } from "@halonicjs/events";
import { agentPlacement, trustRecord } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FileAgentPlacementStore } from "./agent-placement-store.ts";
import { FolderRunStore, type FolderRunStoreOptions } from "./run-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";
import { FileTrustStore } from "./trust-store.ts";

/**
 * The trust store, the agent placement store and the run store's snapshot
 * on Windows, with a program that holds the target open, as
 * `definition-store-rename-retry.test.ts` does for the folder definition
 * store: the next `busyRenames` renames fail with `EBUSY` as Windows gives
 * it. Waits between tries are counted, never really waited.
 */
const hooks = vi.hoisted(() => ({ busyRenames: 0, waits: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    rename: async (from: string, to: string) => {
      if (hooks.busyRenames > 0) {
        hooks.busyRenames -= 1;
        throw Object.assign(new Error("EBUSY: resource busy or locked, rename"), {
          code: "EBUSY",
        });
      }
      return await fs.rename(from, to);
    },
  };
});

vi.mock("node:timers/promises", () => ({
  setTimeout: async () => {
    hooks.waits += 1;
  },
}));

const realPlatform = Object.getOwnPropertyDescriptor(process, "platform");

beforeAll(() => {
  Object.defineProperty(process, "platform", { value: "win32" });
});
afterAll(async () => {
  if (realPlatform !== undefined) {
    Object.defineProperty(process, "platform", realPlatform);
  }
  await removeTempFolders();
});
afterEach(() => {
  hooks.busyRenames = 0;
  hooks.waits = 0;
});

/** The one file in `root`, so a test sees that no temporary file is left. */
async function onlyFile(root: string): Promise<string> {
  const names = await readdir(root);
  expect(names).toHaveLength(1);
  return join(root, names[0] ?? "");
}

function entered(runId: string, seq: number): RunEvent {
  return { runId, seq, at: "2026-01-01T00:00:02.000Z", type: "state.entered", state: `s${seq}` };
}

/** A run store in a new folder that holds run `r1` with one event and the snapshot `{ step: 1 }`. */
async function runStoreWithSnapshot(
  options: FolderRunStoreOptions = {},
): Promise<{ root: string; store: FolderRunStore }> {
  const root = await tempFolder();
  const store = new FolderRunStore(root, options);
  await store.append("r1", 0, [entered("r1", 1)], { snapshot: { step: 1 } });
  return { root, store };
}

verifies("fs-node.rename-retry-on-windows", () => {
  describe("trust store: a record another program holds on Windows", () => {
    const location = "/workspaces/acme";

    it("grants once the other program lets go of the record", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await store.grant(trustRecord(location, "hfp1:aa"));
      hooks.busyRenames = 2;
      await store.grant(trustRecord(location, "hfp1:bb"));
      expect(hooks.waits).toBe(2);
      expect(await store.get(location)).toEqual(trustRecord(location, "hfp1:bb"));
      await onlyFile(root);
    });

    it("fails, keeps the old record and removes its temporary file when the record stays held", async () => {
      const root = await tempFolder();
      const store = new FileTrustStore(root);
      await store.grant(trustRecord(location, "hfp1:aa"));
      hooks.busyRenames = 100;
      await expect(store.grant(trustRecord(location, "hfp1:bb"))).rejects.toMatchObject({
        code: "EBUSY",
      });
      expect(hooks.waits).toBe(5);
      expect(await store.get(location)).toEqual(trustRecord(location, "hfp1:aa"));
      await onlyFile(root);
    });
  });

  describe("agent placement store: a choice another program holds on Windows", () => {
    const key = { location: "/workspaces/acme", agent: "coder" };

    it("saves once the other program lets go of the choice", async () => {
      const root = await tempFolder();
      const store = new FileAgentPlacementStore(root);
      await store.save(agentPlacement(key.location, key.agent, "sha256:aa"));
      hooks.busyRenames = 2;
      await store.save(agentPlacement(key.location, key.agent, "sha256:bb"));
      expect(hooks.waits).toBe(2);
      expect(await store.get(key)).toEqual(agentPlacement(key.location, key.agent, "sha256:bb"));
      await onlyFile(root);
    });

    it("fails, keeps the old choice and removes its temporary file when the choice stays held", async () => {
      const root = await tempFolder();
      const store = new FileAgentPlacementStore(root);
      await store.save(agentPlacement(key.location, key.agent, "sha256:aa"));
      hooks.busyRenames = 100;
      await expect(
        store.save(agentPlacement(key.location, key.agent, "sha256:bb")),
      ).rejects.toMatchObject({ code: "EBUSY" });
      expect(hooks.waits).toBe(5);
      expect(await store.get(key)).toEqual(agentPlacement(key.location, key.agent, "sha256:aa"));
      await onlyFile(root);
    });
  });

  describe("run store: a snapshot another program holds on Windows", () => {
    it("writes the snapshot once the other program lets go of it", async () => {
      const { root, store } = await runStoreWithSnapshot();
      hooks.busyRenames = 2;
      await store.append("r1", 1, [entered("r1", 2)], { snapshot: { step: 2 } });
      expect(hooks.waits).toBe(2);
      expect(await store.snapshot("r1")).toEqual({ seq: 2, state: { step: 2 } });
      expect((await readdir(root)).sort()).toEqual(["r1.jsonl", "r1.snapshot.json"]);
    });

    it("stores the events, reports the error and keeps the old snapshot when it stays held", async () => {
      const failures: [string, unknown][] = [];
      const { root, store } = await runStoreWithSnapshot({
        onSnapshotError: (runId, error) => failures.push([runId, error]),
      });
      hooks.busyRenames = 100;
      await store.append("r1", 1, [entered("r1", 2)], { snapshot: { step: 2 } });
      expect(hooks.waits).toBe(5);
      expect(failures).toEqual([["r1", expect.objectContaining({ code: "EBUSY" })]]);
      expect((await store.events("r1")).map((event) => event.seq)).toEqual([1, 2]);
      expect(JSON.parse(await readFile(join(root, "r1.snapshot.json"), "utf8"))).toEqual({
        seq: 1,
        state: { step: 1 },
      });
      expect((await readdir(root)).sort()).toEqual(["r1.jsonl", "r1.snapshot.json"]);
    });
  });
});
