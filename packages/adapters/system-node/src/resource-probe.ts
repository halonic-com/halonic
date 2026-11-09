import { env, memoryUsage, pid, platform } from "node:process";
import type { FolderSize, ProcessUsage, ResourceProbe } from "@halonicjs/ports";
import { folderSize } from "./folder-size.ts";
import { freeDisk } from "./free-disk.ts";
import { linuxProcessTable } from "./linux-process-table.ts";
import type { ReadProcessTable } from "./process-table.ts";
import { descendantsOf } from "./process-tree.ts";
import { psProcessTable } from "./ps-process-table.ts";
import { systemRunProgram } from "./run-program.ts";
import { windowsProcessTable } from "./windows-process-table.ts";

/** What a {@link NodeResourceProbe} reads; every option has the real machine's default. */
export interface NodeResourceProbeOptions {
  /** The engine's process, whose children are listed. Default: this process. */
  enginePid?: number;
  /** Reads the engine's memory in bytes. Default: `process.memoryUsage.rss`. */
  engineMemory?: () => number;
  /** Reads every process on the machine. Default: {@link systemProcessTable}. */
  readProcessTable?: ReadProcessTable;
  /**
   * How many files `folderSize` counts before it stops and says the size is
   * incomplete, so a huge folder can't keep `halonic doctor` waiting.
   * Default: {@link defaultMaxFilesCounted}.
   */
  maxFilesCounted?: number;
}

/** 200,000 files: far more than a workspace's runs and caches hold. */
export const defaultMaxFilesCounted = 200_000;

/**
 * The process-table reader for this machine: `/proc` on Linux, PowerShell's
 * `Get-CimInstance` on Windows and `ps` everywhere else.
 */
export function systemProcessTable(): ReadProcessTable {
  if (platform === "linux") return linuxProcessTable();
  if (platform === "win32") {
    // Windows always sets SystemRoot; the usual folder stands in if a caller cleared it.
    const windowsFolder = env["SystemRoot"] ?? "C:\\Windows"; // leak-guard: allow absolute-path Windows' own install folder
    return windowsProcessTable(systemRunProgram, windowsFolder);
  }
  return psProcessTable(systemRunProgram);
}

/**
 * The `ResourceProbe` port on Node (requirement `system-node.resource-probe`).
 * Each method reads the machine when it's called; nothing is cached and
 * nothing polls.
 *
 * @example
 * const probe = new NodeResourceProbe();
 * const free = await probe.freeDisk(dataFolder);
 */
export class NodeResourceProbe implements ResourceProbe {
  readonly #enginePid: number;
  readonly #engineMemory: () => number;
  readonly #readProcessTable: ReadProcessTable;
  readonly #maxFilesCounted: number;

  constructor(options: NodeResourceProbeOptions = {}) {
    this.#enginePid = options.enginePid ?? pid;
    this.#engineMemory = options.engineMemory ?? memoryUsage.rss;
    this.#readProcessTable = options.readProcessTable ?? systemProcessTable();
    this.#maxFilesCounted = options.maxFilesCounted ?? defaultMaxFilesCounted;
  }

  async engineMemory(): Promise<number> {
    return this.#engineMemory();
  }

  async childProcesses(): Promise<readonly ProcessUsage[]> {
    const table = await this.#readProcessTable();
    return descendantsOf(this.#enginePid, table.rows, table.readerPid);
  }

  async folderSize(path: string): Promise<FolderSize> {
    return folderSize(path, this.#maxFilesCounted);
  }

  async freeDisk(path: string): Promise<number> {
    return freeDisk(path);
  }
}
