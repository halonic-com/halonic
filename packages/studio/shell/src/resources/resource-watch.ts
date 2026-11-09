import type { AnnouncerTimers } from "../announcer/timers.ts";
import { type EngineResourceReport, readResourceReport } from "./resource-report.ts";

/** Below this much free space on the data drive, the disk counts as low: 1 GB. */
export const lowDiskBytes = 1024 ** 3;
/** How often the shell reads the resource report by itself. */
export const resourceCheckIntervalMs = 60_000;

/** Why the report was read: the minute's check, or before a big write. */
export type ResourceCheckReason = "interval" | "run" | "download" | "model-pull";

/** One reading of the engine's resource report. */
export interface ResourceReading {
  readonly report: EngineResourceReport;
  /** Whether the data drive has less than {@link lowDiskBytes} free. */
  readonly lowDisk: boolean;
  /** When it was read, from the shell's timers. */
  readonly at: number;
  readonly reason: ResourceCheckReason;
}

/** Receives each new reading. */
export type ResourceListener = (reading: ResourceReading) => void;

/** What {@link watchResources} needs. */
export interface ResourceWatchOptions {
  /** Asks the engine for its resource report. */
  readonly read: () => Promise<unknown>;
  readonly timers: AnnouncerTimers;
  /**
   * Gets the error of a minute's read that failed; the next minute reads
   * again. A failed `check` rejects instead.
   */
  readonly onError: (error: unknown) => void;
}

/** The shell's view of the engine's resource use. */
export interface ResourceWatch {
  /** The last reading, `undefined` until the first one. */
  readonly latest: ResourceReading | undefined;
  /**
   * Reads the report now, before a run, a download or a model pull, so the
   * caller can stop when the disk is low. Joins a read already under way.
   */
  check(before: Exclude<ResourceCheckReason, "interval">): Promise<ResourceReading>;
  /** Listens to every new reading. Returns a function that stops listening. */
  on(event: "resources", listener: ResourceListener): () => void;
  /** Stops the minute's check. Readings that arrive later are dropped. */
  stop(): void;
}

/**
 * Reads the engine's resource report at once and then once a minute, and
 * marks the disk low below 1 GB free (HAL-1668, FS7). The next minute's read
 * is timed from the end of the last one, so reads never overlap.
 */
export function watchResources(options: ResourceWatchOptions): ResourceWatch {
  const { timers } = options;
  const listeners = new Set<ResourceListener>();
  let latest: ResourceReading | undefined;
  let inFlight: Promise<ResourceReading> | undefined;
  let timer: unknown;
  let stopped = false;

  const read = (reason: ResourceCheckReason): Promise<ResourceReading> => {
    inFlight ??= options
      .read()
      .then((value) => {
        const reading = readingOf(value, timers.now(), reason);
        if (!stopped) {
          latest = reading;
          notify(listeners, reading);
        }
        return reading;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };

  const tick = (): void => {
    timer = undefined;
    read("interval")
      .catch(options.onError)
      .finally(() => {
        if (!stopped) {
          timer = timers.setTimeout(tick, resourceCheckIntervalMs);
        }
      });
  };

  tick();
  return {
    get latest() {
      return latest;
    },
    check: read,
    on(_event, listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop() {
      stopped = true;
      timers.clearTimeout(timer);
      timer = undefined;
    },
  };
}

function readingOf(value: unknown, at: number, reason: ResourceCheckReason): ResourceReading {
  const report = readResourceReport(value);
  return { report, lowDisk: report.freeDiskBytes < lowDiskBytes, at, reason };
}

function notify(listeners: ReadonlySet<ResourceListener>, reading: ResourceReading): void {
  const errors: unknown[] = [];
  for (const listener of [...listeners]) {
    try {
      listener(reading);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Several resources listeners failed.");
  }
}
