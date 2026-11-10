import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunEvent } from "@halonicjs/events";
import type { RecordChange } from "@halonicjs/ports";
import {
  agentPlacement,
  connectionSettings,
  trustRecord,
  unfencedRunConsent,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FileAgentPlacementStore } from "./agent-placement-store.ts";
import { FolderBlobStore } from "./blob-store.ts";
import { FileConnectionSettingsStore } from "./connection-settings-store.ts";
import { FileRecordStore } from "./record-store.ts";
import { FolderRunStore, type FolderRunStoreOptions } from "./run-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";
import { FileTrustStore } from "./trust-store.ts";
import { FileUnfencedRunConsentStore } from "./unfenced-run-consent-store.ts";

/**
 * The trust store, the agent placement store, the connection settings
 * store, the blob store, the unfenced-run consent store, the record store's
 * compact and the run store's snapshot on Windows, with a program that holds
 * the target open, as `definition-store-rename-retry.test.ts` does for the
 * folder definition store: the next `busyRenames` renames fail with `EBUSY`
 * as Windows gives it. Waits between tries are counted, never really waited.
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

function lead(id: string, op: RecordChange["op"], name: string, second: number): RecordChange {
  const at = new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
  return { at, collection: "leads", id, op, values: { name } };
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

  describe("connection settings store: settings another program holds on Windows", () => {
    const location = "/workspaces/acme";

    it("saves once the other program lets go of the settings", async () => {
      const root = await tempFolder();
      const store = new FileConnectionSettingsStore(root);
      await store.save(connectionSettings(location, "mail", false));
      hooks.busyRenames = 2;
      await store.save(connectionSettings(location, "mail", true));
      expect(hooks.waits).toBe(2);
      expect(await store.get({ location, connector: "mail" })).toEqual(
        connectionSettings(location, "mail", true),
      );
      await onlyFile(root);
    });

    it("fails, keeps the old settings and removes its temporary file when they stay held", async () => {
      const root = await tempFolder();
      const store = new FileConnectionSettingsStore(root);
      await store.save(connectionSettings(location, "mail", false));
      hooks.busyRenames = 100;
      await expect(store.save(connectionSettings(location, "mail", true))).rejects.toMatchObject({
        code: "EBUSY",
      });
      expect(hooks.waits).toBe(5);
      expect(await store.get({ location, connector: "mail" })).toEqual(
        connectionSettings(location, "mail", false),
      );
      await onlyFile(root);
    });
  });

  describe("blob store: a blob another program holds on Windows", () => {
    // A put renames only when the blob isn't stored yet, so there is no old
    // blob to keep: when it stays held, nothing is stored.
    const hello = new TextEncoder().encode("hello");
    const helloHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

    it("puts once the other program lets go of the blob", async () => {
      const root = await tempFolder();
      const store = new FolderBlobStore(root);
      hooks.busyRenames = 2;
      await store.put(hello, "text/plain");
      expect(hooks.waits).toBe(2);
      expect(await store.get(helloHash)).toEqual(hello);
      expect(await onlyFile(join(root, "2c"))).toBe(join(root, "2c", helloHash));
    });

    it("fails, stores nothing and removes its temporary file when the blob stays held", async () => {
      const root = await tempFolder();
      const store = new FolderBlobStore(root);
      hooks.busyRenames = 100;
      await expect(store.put(hello, "text/plain")).rejects.toMatchObject({ code: "EBUSY" });
      expect(hooks.waits).toBe(5);
      expect(await store.get(helloHash)).toBeNull();
      expect(await readdir(join(root, "2c"))).toEqual([]);
    });
  });

  describe("unfenced-run consent store: a yes another program holds on Windows", () => {
    it("saves once the other program lets go of the yes", async () => {
      const root = await tempFolder();
      const store = new FileUnfencedRunConsentStore(root);
      await store.save(unfencedRunConsent("windows"));
      hooks.busyRenames = 2;
      await store.save(unfencedRunConsent("linux"));
      expect(hooks.waits).toBe(2);
      expect(await store.get()).toEqual(unfencedRunConsent("linux"));
      await onlyFile(root);
    });

    it("fails, keeps the old yes and removes its temporary file when the yes stays held", async () => {
      const root = await tempFolder();
      const store = new FileUnfencedRunConsentStore(root);
      await store.save(unfencedRunConsent("windows"));
      hooks.busyRenames = 100;
      await expect(store.save(unfencedRunConsent("linux"))).rejects.toMatchObject({
        code: "EBUSY",
      });
      expect(hooks.waits).toBe(5);
      expect(await store.get()).toEqual(unfencedRunConsent("windows"));
      await onlyFile(root);
    });
  });

  describe("record store: a log another program holds on Windows while it is compacted", () => {
    // The append starts while the compact runs, so it waits for the compact's
    // write lock, retries included, and lands on the log the compact leaves.
    it("compacts once the other program lets go, and an append waiting on it lands after", async () => {
      const root = await tempFolder();
      const store = new FileRecordStore(root);
      await store.append([lead("1", "add", "Ada", 1), lead("1", "update", "Ada L.", 2)]);
      hooks.busyRenames = 2;
      await Promise.all([store.compact("leads"), store.append([lead("2", "add", "Grace", 3)])]);
      expect(hooks.waits).toBe(2);
      expect(await store.changes("leads")).toEqual([
        lead("1", "seed", "Ada L.", 2),
        lead("2", "add", "Grace", 3),
      ]);
      await onlyFile(root);
    });

    it("fails, keeps the old log and removes its temporary file when it stays held, and the waiting append lands on the old log", async () => {
      const root = await tempFolder();
      const store = new FileRecordStore(root);
      await store.append([lead("1", "add", "Ada", 1), lead("1", "update", "Ada L.", 2)]);
      hooks.busyRenames = 100;
      const [compacted, appended] = await Promise.allSettled([
        store.compact("leads"),
        store.append([lead("2", "add", "Grace", 3)]),
      ]);
      expect(compacted).toMatchObject({ status: "rejected", reason: { code: "EBUSY" } });
      expect(appended).toEqual({ status: "fulfilled", value: undefined });
      expect(hooks.waits).toBe(5);
      expect(await store.changes("leads")).toEqual([
        lead("1", "add", "Ada", 1),
        lead("1", "update", "Ada L.", 2),
        lead("2", "add", "Grace", 3),
      ]);
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
