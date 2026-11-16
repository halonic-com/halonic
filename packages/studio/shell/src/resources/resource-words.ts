import type { EngineResourceReport } from "./resource-report.ts";

const bytesPerMegabyte = 1024 ** 2;
const bytesPerGigabyte = 1024 ** 3;

/**
 * Halonic's memory as the status bar item says it: the engine and the processes it started (HAL-1668
 * FS7). Whole megabytes below 1 GB, then one decimal in gigabytes (1023.7 MB reads
 * "1.0 GB", never "1024 MB").
 *
 * @example
 * memoryText(230 * 1024 ** 2); // "230 MB"
 * memoryText(1.2 * 1024 ** 3); // "1.2 GB"
 */
export function memoryText(bytes: number): string {
  const megabytes = Math.round(bytes / bytesPerMegabyte);
  if (megabytes < 1024) {
    return `${megabytes} MB`;
  }
  return `${(bytes / bytesPerGigabyte).toFixed(1)} GB`;
}

/**
 * Free disk space in whole gigabytes, with one decimal below 10 GB. It rounds down, so it never
 * claims more room than there is (0.96 GB reads "0.9 GB", under the 1 GB warning line). Below 0.1 GB the number would
 * read "0.0 GB", which looks broken, so it says "less than 0.1 GB" (microcopy 22 F12, F19).
 *
 * @example
 * freeSpaceText(48.3 * 1024 ** 3); // "48 GB"
 * freeSpaceText(7.44 * 1024 ** 3); // "7.4 GB"
 * freeSpaceText(0.04 * 1024 ** 3); // "less than 0.1 GB"
 */
export function freeSpaceText(bytes: number): string {
  const gigabytes = bytes / bytesPerGigabyte;
  if (gigabytes < 0.1) {
    return "less than 0.1 GB";
  }
  return `${gigabytes < 10 ? (Math.floor(gigabytes * 10) / 10).toFixed(1) : Math.floor(gigabytes)} GB`;
}

/** The memory Halonic uses: the engine's and that of each process it started. */
export function halonicMemoryBytes(report: EngineResourceReport): number {
  return report.childProcesses.reduce(
    (total, child) => total + child.memoryBytes,
    report.engineMemoryBytes,
  );
}

/**
 * The words of the resource status bar item (microcopy 22 F11 and F12). The tooltip sentences
 * (19.2) are placeholders until the sandbox card HAL-1784 settles them.
 */
export const resourceWords = {
  /** The visible text while the disk has room: "230 MB · 48 GB free". */
  usage: (memory: string, free: string) => `${memory} · ${free} free`,
  /** The visible text while the disk is low: "Low on disk space: 0.8 GB free". */
  lowDisk: (free: string) => `Low on disk space: ${free} free`,
  /** The item's name for a screen reader, also its tooltip. */
  usageName: (memory: string, free: string) =>
    `Halonic uses ${memory} of memory. ${free} free on this disk.`,
  /** The low-disk item's name for a screen reader, also its tooltip. */
  lowDiskName: (free: string) =>
    `Low on disk space: ${free} free. Free some space so runs can write their logs.`,
} as const;
