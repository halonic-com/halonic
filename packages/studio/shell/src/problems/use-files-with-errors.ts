import { useCallback, useSyncExternalStore } from "react";
import type { FilesWithErrorsSource, FileWithErrors } from "./files-with-errors.ts";

/** The latest read of one source's list, shared by every view that shows it. */
export interface FilesWithErrorsReading {
  /** The list as last read, `[]` when it can't be read, or `undefined` before the first read. */
  current(): readonly FileWithErrors[] | undefined;
  /**
   * Calls `listener` after each new read. The first listener starts the reads; when the last one
   * goes they stop and the list is forgotten.
   */
  subscribe(listener: () => void): () => void;
}

const readings = new WeakMap<FilesWithErrorsSource, FilesWithErrorsReading>();

/**
 * The shared reading of `source`'s list: the status bar, Home and a workflow's page show the same
 * list, so it is read once after every change and save of the files, not once for each of them.
 *
 * @example
 * const count = filesWithErrorsReading(source).current()?.length ?? 0;
 */
export function filesWithErrorsReading(source: FilesWithErrorsSource): FilesWithErrorsReading {
  let reading = readings.get(source);
  if (reading === undefined) {
    reading = readingOf(source);
    readings.set(source, reading);
  }
  return reading;
}

function readingOf(source: FilesWithErrorsSource): FilesWithErrorsReading {
  const listeners = new Set<() => void>();
  let files: readonly FileWithErrors[] | undefined;
  let stop = () => {};
  // Only the newest read counts, so a slow one can't put back a list an edit has changed.
  let reads = 0;
  const settle = (mine: number, list: readonly FileWithErrors[]) => {
    if (mine !== reads) return;
    files = list;
    for (const listener of listeners) listener();
  };
  const read = () => {
    const mine = ++reads;
    source.list().then(
      (list) => settle(mine, list),
      () => settle(mine, []),
    );
  };
  return {
    current: () => files,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        stop = source.subscribe(read);
        read();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        stop();
        // A read still on its way when the last view goes doesn't count, and with no reads the
        // list could go stale, so the next view starts from a new first read.
        reads++;
        files = undefined;
      };
    },
  };
}

const none: readonly FileWithErrors[] = [];
const noReading = () => () => {};

/**
 * The shared list of files with errors, read again after every change and save of the files, or
 * `undefined` before its first read. Empty where the app gives no list, and when the list can't be
 * read, so a view that shows the list shows nothing rather than a count it can't back up.
 *
 * @example
 * const files = useFilesWithErrorsReading(context.services.find(FilesWithErrorsService)) ?? [];
 */
export function useFilesWithErrorsReading(
  source: FilesWithErrorsSource | undefined,
): readonly FileWithErrors[] | undefined {
  const reading = source === undefined ? undefined : filesWithErrorsReading(source);
  const subscribe = useCallback(
    (listener: () => void) => reading?.subscribe(listener) ?? noReading(),
    [reading],
  );
  return useSyncExternalStore(subscribe, () => (reading === undefined ? none : reading.current()));
}

/**
 * The shared list of files with errors, as {@link useFilesWithErrorsReading}, and empty before its
 * first read.
 *
 * @example
 * const files = useFilesWithErrors(context.services.find(FilesWithErrorsService));
 */
export function useFilesWithErrors(
  source: FilesWithErrorsSource | undefined,
): readonly FileWithErrors[] {
  return useFilesWithErrorsReading(source) ?? none;
}
