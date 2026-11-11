import { type FileHandle, open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunEvent } from "@halonicjs/events";
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
import { FolderDefinitionStore } from "./definition-store.ts";
import { FileRecordStore } from "./record-store.ts";
import { FolderRunStore } from "./run-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";
import { FileTrustStore } from "./trust-store.ts";
import { FileUnfencedRunConsentStore } from "./unfenced-run-consent-store.ts";

afterAll(removeTempFolders);
afterEach(() => {
  vi.restoreAllMocks();
});

/** The prototype every open file's handle shares, so a spy on it sees every flush. */
let handles: FileHandle;

beforeAll(async () => {
  const handle = await open(join(await tempFolder(), "probe"), "w");
  await handle.close();
  handles = Object.getPrototypeOf(handle) as FileHandle;
});

/** Counts the flushes of file data (`sync`) and of appends (`datasync`) while `work` runs. */
async function flushesDuring(
  work: () => Promise<unknown>,
): Promise<{ sync: number; datasync: number }> {
  const sync = vi.spyOn(handles, "sync");
  const datasync = vi.spyOn(handles, "datasync");
  await work();
  return { sync: sync.mock.calls.length, datasync: datasync.mock.calls.length };
}

function started(runId: string): RunEvent {
  return {
    runId,
    seq: 1,
    at: "2026-01-01T00:00:01.000Z",
    type: "run.started",
    hubId: "hub",
    workflowId: "flow",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
  };
}

// Without a flush, a power cut soon after a rename can leave an empty file
// where the old one was, and an append reported as stored can be lost
// (HAL-5215).
verifies("fs-node.writes-reach-the-disk", () => {
  describe("a write renamed into place", () => {
    it("flushes a workspace file before it replaces the old one", async () => {
      const root = await tempFolder();
      await writeFile(join(root, "writer.agent.yaml"), "old", "utf8");
      const seenAtFlush: string[] = [];
      const original = handles.sync;
      vi.spyOn(handles, "sync").mockImplementation(async function (this: FileHandle) {
        seenAtFlush.push(await readFile(join(root, "writer.agent.yaml"), "utf8"));
        await original.call(this);
      });
      await new FolderDefinitionStore(root).write("writer.agent.yaml", "new");
      expect(seenAtFlush).toEqual(["old"]);
      expect(await readFile(join(root, "writer.agent.yaml"), "utf8")).toBe("new");
    });

    it.each([
      ["trust record", (root: string) => new FileTrustStore(root).grant(trustRecord("/w"))],
      [
        "placement record",
        (root: string) => new FileAgentPlacementStore(root).save(agentPlacement("/w", "writer")),
      ],
      [
        "connector setting",
        (root: string) => new FileConnectionSettingsStore(root).save(connectionSettings("/w")),
      ],
      [
        "yes to run without the sandbox",
        (root: string) => new FileUnfencedRunConsentStore(root).save(unfencedRunConsent()),
      ],
      [
        "blob",
        (root: string) => new FolderBlobStore(root).put(new Uint8Array([1, 2]), "text/plain"),
      ],
      [
        "run snapshot",
        (root: string) =>
          new FolderRunStore(root).append("r1", 0, [started("r1")], { snapshot: { step: 1 } }),
      ],
    ])("flushes a %s before it renames it into place", async (_name, write) => {
      const root = join(await tempFolder(), "store");
      const { sync } = await flushesDuring(() => write(root));
      expect(sync).toBe(1);
    });
  });

  describe("an append", () => {
    it("flushes a run's events before it reports them stored", async () => {
      const store = new FolderRunStore(await tempFolder());
      const { datasync } = await flushesDuring(() => store.append("r1", 0, [started("r1")]));
      expect(datasync).toBe(1);
    });

    it("flushes a record change before it reports it stored", async () => {
      const store = new FileRecordStore(join(await tempFolder(), "records"));
      const { datasync } = await flushesDuring(() =>
        store.append([
          {
            at: "2026-01-01T00:00:00.000Z",
            collection: "notes",
            id: "1",
            op: "add",
            values: { text: "Call on Monday" },
          },
        ]),
      );
      expect(datasync).toBe(1);
    });
  });
});
