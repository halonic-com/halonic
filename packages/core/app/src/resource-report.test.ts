import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import type {
  FolderSize,
  ProcessUsage,
  ResourceProbe,
  RunFilter,
  RunStore,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type DataFolder,
  type LoadedModelSource,
  lowDiskBytes,
  ResourceReport,
  type ResourceReportOptions,
} from "./resource-report.ts";

const mebibyte = 1024 ** 2;
const tenOClock = new Date(Date.UTC(2026, 10, 9, 10, 0, 0));

/** A probe with fixed numbers. A method set to `throws` fails with that error. */
class FakeProbe implements ResourceProbe {
  engineBytes = 64 * mebibyte;
  processes: ProcessUsage[] = [];
  folders = new Map<string, FolderSize>();
  freeBytes = 100 * 1024 * mebibyte;
  throws: { method: keyof ResourceProbe; error: Error } | undefined;
  /** Every path `freeDisk` was asked about. */
  readonly freeDiskPaths: string[] = [];

  async engineMemory(): Promise<number> {
    this.failIf("engineMemory");
    return this.engineBytes;
  }

  async childProcesses(): Promise<readonly ProcessUsage[]> {
    this.failIf("childProcesses");
    return this.processes;
  }

  async folderSize(path: string): Promise<FolderSize> {
    this.failIf("folderSize");
    return this.folders.get(path) ?? { bytes: 0, complete: true };
  }

  async freeDisk(path: string): Promise<number> {
    this.failIf("freeDisk");
    this.freeDiskPaths.push(path);
    return this.freeBytes;
  }

  private failIf(method: keyof ResourceProbe): void {
    if (this.throws?.method === method) throw this.throws.error;
  }
}

/** The two run-store methods the report reads, over fixed logs. */
class FakeRuns implements Pick<RunStore, "list" | "events"> {
  readonly filters: (RunFilter | undefined)[] = [];
  readonly #logs: RunEvent[][];

  constructor(logs: RunEvent[][] = []) {
    this.#logs = logs;
  }

  async list(filter?: RunFilter): Promise<RunSummary[]> {
    this.filters.push(filter);
    const statuses = [filter?.status ?? []].flat();
    return this.#logs
      .map((log) => summarize(log))
      .filter((summary): summary is RunSummary => summary !== null)
      .filter((summary) => statuses.length === 0 || statuses.includes(summary.status));
  }

  async events(runId: string): Promise<RunEvent[]> {
    return this.#logs.find((log) => log[0]?.runId === runId) ?? [];
  }
}

function report(overrides: Partial<ResourceReportOptions> = {}): ResourceReport {
  return new ResourceReport({
    probe: new FakeProbe(),
    runs: new FakeRuns(),
    clock: { now: () => new Date(tenOClock) },
    dataRoot: "/data/halonic",
    dataFolders: [],
    ...overrides,
  });
}

function models(
  id: string,
  loaded: () => Promise<{ name: string; memoryBytes?: number }[]>,
): LoadedModelSource {
  return { id, loadedModels: loaded };
}

verifies("app.resource-report", () => {
  it("adds the processes below the engine to its memory", async () => {
    const probe = new FakeProbe();
    probe.processes = [
      { pid: 41, name: "claude", memoryBytes: 100 * mebibyte },
      { pid: 42, name: "srt", memoryBytes: 30 * mebibyte },
    ];

    const { memory } = await report({ probe }).read();

    expect(memory).toEqual({
      ok: true,
      value: { engineBytes: 64 * mebibyte, processes: probe.processes, totalBytes: 194 * mebibyte },
    });
  });

  it("gives each data folder's size, and says when the count stopped at its limit", async () => {
    const probe = new FakeProbe();
    probe.folders.set("/data/halonic/acme/runs", { bytes: 2048, complete: true });
    probe.folders.set("/data/halonic/cache", { bytes: 9 * mebibyte, complete: false });
    const dataFolders: DataFolder[] = [
      { kind: "run-logs", workspace: "acme", path: "/data/halonic/acme/runs" },
      { kind: "caches", workspace: null, path: "/data/halonic/cache" },
    ];

    const { data } = await report({ probe, dataFolders }).read();

    expect(data).toEqual([
      { ...dataFolders[0], size: { ok: true, value: { bytes: 2048, complete: true } } },
      { ...dataFolders[1], size: { ok: true, value: { bytes: 9 * mebibyte, complete: false } } },
    ]);
  });

  it("marks the disk low only under 1 GiB free, on the drive of the data folder", async () => {
    const probe = new FakeProbe();

    probe.freeBytes = 512 * mebibyte;
    const low = await report({ probe }).read();
    probe.freeBytes = lowDiskBytes;
    const enough = await report({ probe }).read();

    expect(low.disk).toEqual({ ok: true, value: { freeBytes: 512 * mebibyte, low: true } });
    expect(enough.disk).toEqual({ ok: true, value: { freeBytes: lowDiskBytes, low: false } });
    expect(probe.freeDiskPaths).toEqual(["/data/halonic", "/data/halonic"]);
  });

  it("asks each local provider for its loaded models and keeps a failing one's error", async () => {
    const down = new Error("connection refused");
    const modelSources = [
      models("ollama", async () => [{ name: "llama3.2", memoryBytes: 2048 * mebibyte }]),
      models("lmstudio", async () => {
        throw down;
      }),
    ];

    const resources = await report({ modelSources }).read();

    expect(resources.models).toEqual([
      {
        provider: "ollama",
        models: { ok: true, value: [{ name: "llama3.2", memoryBytes: 2048 * mebibyte }] },
      },
      { provider: "lmstudio", models: { ok: false, error: down } },
    ]);
  });

  it("still gives every other part when one source can't be read", async () => {
    const probe = new FakeProbe();
    const broken = new Error("process table unreadable");
    probe.throws = { method: "childProcesses", error: broken };
    const dataFolders: DataFolder[] = [{ kind: "downloads", workspace: "acme", path: "/data/dl" }];

    const resources = await report({ probe, dataFolders }).read();

    expect(resources.memory).toEqual({ ok: false, error: broken });
    expect(resources.data[0]?.size.ok).toBe(true);
    expect(resources.disk.ok).toBe(true);
    expect(resources.waits).toEqual({ ok: true, value: [] });
  });

  it("keeps a folder's error on that folder alone", async () => {
    const probe = new FakeProbe();
    const denied = new Error("permission denied");
    probe.throws = { method: "folderSize", error: denied };

    const { data, memory } = await report({
      probe,
      dataFolders: [{ kind: "caches", workspace: null, path: "/data/cache" }],
    }).read();

    expect(data).toEqual([
      { kind: "caches", workspace: null, path: "/data/cache", size: { ok: false, error: denied } },
    ]);
    expect(memory.ok).toBe(true);
  });

  it("stamps the report with the clock's time", async () => {
    const { at } = await report().read();

    expect(at).toBe("2026-11-09T10:00:00.000Z");
  });
});

verifies("app.resource-report-waits", () => {
  it("reads the waits from the running and waiting runs only", async () => {
    const started: RunEvent = {
      runId: "r1",
      seq: 1,
      at: "2026-11-09T09:59:58.000Z",
      type: "run.started",
      hubId: "acme",
      workflowId: "publish",
      input: {},
      kind: "run",
      definitionsVersion: "v1",
    };
    const harness: RunEvent = {
      runId: "r1",
      seq: 2,
      at: "2026-11-09T09:59:58.000Z",
      type: "harness.started",
      state: "write",
      agent: "writer",
      harness: "codex",
      timeoutMs: 60_000,
    };
    const runs = new FakeRuns([[started, harness]]);

    const { waits } = await report({ runs }).read();

    expect(runs.filters).toEqual([{ status: ["running", "waiting"] }]);
    expect(waits).toEqual({
      ok: true,
      value: [
        expect.objectContaining({ kind: "harness", runId: "r1", harness: "codex", waitedMs: 2000 }),
      ],
    });
  });

  it("carries the run store's error when the runs can't be listed", async () => {
    const unreadable = new Error("run index locked");
    const runs: Pick<RunStore, "list" | "events"> = {
      list: async () => {
        throw unreadable;
      },
      events: async () => [],
    };

    const { waits, disk } = await report({ runs }).read();

    expect(waits).toEqual({ ok: false, error: unreadable });
    expect(disk.ok).toBe(true);
  });
});

describe("ResourceReport", () => {
  it("reads the machine again each time it's asked, and never on its own", async () => {
    const probe = new FakeProbe();
    const resourceReport = report({ probe });

    expect(probe.freeDiskPaths).toEqual([]);
    await resourceReport.read();
    await resourceReport.read();

    expect(probe.freeDiskPaths).toHaveLength(2);
  });
});
