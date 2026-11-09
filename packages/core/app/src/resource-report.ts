// What the engine uses on this machine, put together for `halonic doctor` and
// the Studio (failure-path guide, rule 3; FS7). Each part is read on its own,
// so one source that can't be read never hides the others.

import type { Clock, FolderSize, ProcessUsage, ResourceProbe, RunStore } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { type ActiveRun, type Wait, waitsInProgress } from "./waits-in-progress.ts";

/** Below this much free space the report warns: 1 GiB (FS7). */
export const lowDiskBytes = 1024 ** 3;

/** A part of the report, or the error that stopped it being read. */
export type Reading<T> = Result<T, unknown>;

/** The engine's memory and the memory of every process below it. */
export interface MemoryUsage {
  engineBytes: number;
  /** The processes below the engine, in ascending `pid` order. */
  processes: ProcessUsage[];
  /** The engine and all its processes together. */
  totalBytes: number;
}

/** Which of Halonic's data a folder holds. */
export type DataKind = "run-logs" | "caches" | "downloads";

/** A folder of Halonic's data, as the host lays them out. */
export interface DataFolder {
  kind: DataKind;
  /** The workspace the data belongs to, or `null` for data every workspace shares. */
  workspace: string | null;
  /** An absolute path. */
  path: string;
}

/** How much disk space one of Halonic's data folders takes. */
export interface DataUsage extends DataFolder {
  size: Reading<FolderSize>;
}

/** The free space on the drive of Halonic's data. */
export interface DiskSpace {
  freeBytes: number;
  /** True under {@link lowDiskBytes}: `doctor` marks the line with a warning. */
  low: boolean;
}

/** A model a local provider holds in memory now, such as one Ollama loaded. */
export interface LoadedModel {
  name: string;
  /** The memory it holds, when the provider says. */
  memoryBytes?: number;
}

/**
 * A provider that can say which models it has loaded. Only local providers
 * offer this (Ollama's does); the host passes the ones the workspace uses.
 */
export interface LoadedModelSource {
  /** The provider's id in the workspace's providers. */
  readonly id: string;
  loadedModels(): Promise<readonly LoadedModel[]>;
}

/** The models one provider has loaded. */
export interface ProviderModels {
  provider: string;
  models: Reading<LoadedModel[]>;
}

/** Everything {@link ResourceReport.read} found, at one moment. */
export interface Resources {
  /** ISO time the report was read. */
  at: string;
  memory: Reading<MemoryUsage>;
  /** In the order the host gave the folders. */
  data: DataUsage[];
  disk: Reading<DiskSpace>;
  /** In the order the host gave the providers. */
  models: ProviderModels[];
  /** Oldest first. */
  waits: Reading<Wait[]>;
}

/** What {@link ResourceReport} needs from the host. */
export interface ResourceReportOptions {
  probe: ResourceProbe;
  /** The run logs, for the waits in progress. */
  runs: Pick<RunStore, "list" | "events">;
  clock: Clock;
  /** Halonic's data folder; the report gives the free space on its drive. */
  dataRoot: string;
  /** The folders whose size the report gives, per workspace. */
  dataFolders: readonly DataFolder[];
  /** The local providers that can say which models they have loaded. Default: none. */
  modelSources?: readonly LoadedModelSource[];
}

/**
 * Reads what the engine uses on this machine (requirements
 * `app.resource-report` and `app.resource-report-waits`): its memory and its
 * processes, the disk space Halonic's data takes, the free disk space with a
 * warning under 1 GiB, the models local providers have loaded, and what the
 * active runs are waiting for.
 *
 * It answers only when asked and keeps no timer, as the core has none.
 * Refreshing is the caller's job: the CLI reads it once, and the Studio
 * asks again at most once a second, timed with its `Clock`.
 *
 * @example
 * const report = new ResourceReport({ probe, runs, clock, dataRoot, dataFolders });
 * const resources = await report.read();
 * if (resources.disk.ok && resources.disk.value.low) warn("low-disk");
 */
export class ResourceReport {
  private readonly options: ResourceReportOptions;

  constructor(options: ResourceReportOptions) {
    this.options = options;
  }

  /** Reads every part once, all at the same time. */
  async read(): Promise<Resources> {
    const now = this.options.clock.now();
    const [memory, data, disk, models, waits] = await Promise.all([
      reading(() => this.memory()),
      this.data(),
      reading(() => this.disk()),
      this.models(),
      reading(() => this.waits(now)),
    ]);
    return { at: now.toISOString(), memory, data, disk, models, waits };
  }

  private async memory(): Promise<MemoryUsage> {
    const [engineBytes, processes] = await Promise.all([
      this.options.probe.engineMemory(),
      this.options.probe.childProcesses(),
    ]);
    const processBytes = processes.reduce((sum, process) => sum + process.memoryBytes, 0);
    return { engineBytes, processes: [...processes], totalBytes: engineBytes + processBytes };
  }

  private data(): Promise<DataUsage[]> {
    return Promise.all(
      this.options.dataFolders.map(async (folder) => ({
        ...folder,
        size: await reading(() => this.options.probe.folderSize(folder.path)),
      })),
    );
  }

  private async disk(): Promise<DiskSpace> {
    const freeBytes = await this.options.probe.freeDisk(this.options.dataRoot);
    return { freeBytes, low: freeBytes < lowDiskBytes };
  }

  private models(): Promise<ProviderModels[]> {
    const sources = this.options.modelSources ?? [];
    return Promise.all(
      sources.map(async (source) => ({
        provider: source.id,
        models: await reading(async () => [...(await source.loadedModels())]),
      })),
    );
  }

  /** Reads the log of every running or waiting run and works out its waits. */
  private async waits(now: Date): Promise<Wait[]> {
    const summaries = await this.options.runs.list({ status: ["running", "waiting"] });
    const active: ActiveRun[] = await Promise.all(
      summaries.map(async (summary) => ({
        summary,
        events: await this.options.runs.events(summary.id),
      })),
    );
    return waitsInProgress(active, now);
  }
}

/** Runs `read` and keeps what it threw as the reading's error. */
async function reading<T>(read: () => Promise<T>): Promise<Reading<T>> {
  try {
    return ok(await read());
  } catch (error) {
    return err(error);
  }
}
