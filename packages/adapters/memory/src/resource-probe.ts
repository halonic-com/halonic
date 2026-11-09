import type { FolderSize, ProcessUsage, ResourceProbe } from "@halonicjs/ports";

/** The numbers a {@link MemoryResourceProbe} starts with. */
export interface MemoryResourceProbeOptions {
  /** The engine's memory. Default: 64 MiB. */
  engineMemoryBytes?: number;
  /** The processes below the engine. Default: none. */
  childProcesses?: readonly ProcessUsage[];
  /** The free space on the one drive this probe has. Default: 100 GiB. */
  freeDiskBytes?: number;
  /**
   * How many files `folderSize` counts before it stops and says the size is
   * incomplete, the way a real adapter caps its walk. Default: no limit.
   */
  maxFilesCounted?: number;
}

const mebibyte = 1024 ** 2;
const gibibyte = 1024 ** 3;

/**
 * A `ResourceProbe` with fixed numbers and files kept in memory, for tests
 * and the browser demo (requirement `memory.resource-probe`). Paths use `/`.
 * Nothing here reads the real machine.
 *
 * @example
 * const probe = new MemoryResourceProbe({ freeDiskBytes: 512 * 1024 ** 2 });
 * probe.writeFile("/data/runs/r1.jsonl", 2048);
 * await probe.folderSize("/data"); // => { bytes: 2048, complete: true }
 */
export class MemoryResourceProbe implements ResourceProbe {
  readonly #files = new Map<string, number>();
  #engineMemoryBytes: number;
  #childProcesses: readonly ProcessUsage[];
  #freeDiskBytes: number;
  readonly #maxFilesCounted: number;

  constructor(options: MemoryResourceProbeOptions = {}) {
    this.#engineMemoryBytes = wholeBytes(options.engineMemoryBytes ?? 64 * mebibyte, "memory");
    this.#childProcesses = copyProcesses(options.childProcesses ?? []);
    this.#freeDiskBytes = wholeBytes(options.freeDiskBytes ?? 100 * gibibyte, "free space");
    this.#maxFilesCounted = options.maxFilesCounted ?? Number.POSITIVE_INFINITY;
  }

  async engineMemory(): Promise<number> {
    return this.#engineMemoryBytes;
  }

  async childProcesses(): Promise<readonly ProcessUsage[]> {
    return copyProcesses(this.#childProcesses);
  }

  async folderSize(path: string): Promise<FolderSize> {
    const inside = `${withoutTrailingSlash(path)}/`;
    let bytes = 0;
    let counted = 0;
    for (const [filePath, size] of this.#files) {
      if (!filePath.startsWith(inside)) continue;
      if (counted === this.#maxFilesCounted) return { bytes, complete: false };
      bytes += size;
      counted += 1;
    }
    return { bytes, complete: true };
  }

  async freeDisk(_path: string): Promise<number> {
    return this.#freeDiskBytes;
  }

  /**
   * For tests: puts a file of `bytes` bytes at `path`, replacing one that is
   * there. The folders above it need no making.
   *
   * @throws RangeError when `bytes` isn't a whole, non-negative number
   */
  writeFile(path: string, bytes: number): void {
    this.#files.set(path, wholeBytes(bytes, "file size"));
  }

  /** For tests: changes the engine's memory. */
  setEngineMemory(bytes: number): void {
    this.#engineMemoryBytes = wholeBytes(bytes, "memory");
  }

  /** For tests: changes the processes below the engine. */
  setChildProcesses(processes: readonly ProcessUsage[]): void {
    this.#childProcesses = copyProcesses(processes);
  }

  /** For tests: changes the free disk space. */
  setFreeDisk(bytes: number): void {
    this.#freeDiskBytes = wholeBytes(bytes, "free space");
  }
}

function withoutTrailingSlash(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

/** A copy in ascending `pid` order, so callers can't change what the probe holds. */
function copyProcesses(processes: readonly ProcessUsage[]): readonly ProcessUsage[] {
  for (const child of processes) wholeBytes(child.memoryBytes, `memory of ${child.name}`);
  return processes.map((child) => ({ ...child })).sort((a, b) => a.pid - b.pid);
}

/** @throws RangeError when `value` isn't a whole, non-negative number of bytes */
function wholeBytes(value: number, what: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`The ${what} must be a whole number of bytes, 0 or more; got ${value}.`);
  }
  return value;
}
