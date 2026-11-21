/**
 * The least time between two re-reads that changed files ask for. Each read starts git, and on
 * Windows each start is a process of its own, so a burst of changes reads once at its start and
 * once at its end (HAL-14812).
 */
export const filesChangedGapMs = 1000;

/** What tells the Changes list to read again; each returns a function that stops it. */
export interface WakeSources {
  /** The window came to the front. */
  readonly onFocus: (listener: () => void) => () => void;
  /** A file of the workspace changed. */
  readonly onFilesChanged: (listener: () => void) => () => void;
}

/**
 * Wakes `listener` each time the window comes to the front, and when files changed, at most once
 * per {@link filesChangedGapMs} and only while `readsFilesChanged` says so: a folder that isn't a
 * repository doesn't become one by editing a file, and the next focus reads again (HAL-14812).
 *
 * @returns a function that stops it
 */
export function wakeOn(
  sources: WakeSources,
  readsFilesChanged: () => boolean,
  listener: () => void,
): () => void {
  const filesChanged = spaced(listener, filesChangedGapMs);
  const stops = [
    sources.onFocus(listener),
    sources.onFilesChanged(() => {
      if (readsFilesChanged()) filesChanged.ask();
    }),
  ];
  return () => {
    filesChanged.stop();
    for (const stop of stops) stop();
  };
}

/**
 * Calls `call` when asked, at most once per `gapMs`: the first ask at once, and the asks during
 * the gap once, at its end.
 */
function spaced(call: () => void, gapMs: number): { ask(): void; stop(): void } {
  let last = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    timer = undefined;
    last = Date.now();
    call();
  };
  return {
    ask() {
      if (timer !== undefined) return;
      const wait = last + gapMs - Date.now();
      if (wait <= 0) run();
      else timer = setTimeout(run, wait);
    },
    stop() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
