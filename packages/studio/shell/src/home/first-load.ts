/** What a Home card's data looks like to {@link firstLoad}: an Inbox or a runs list, say. */
export interface HomeCardSource {
  readonly state: { readonly loaded: boolean; readonly error: unknown };
  /** Calls `listener` after every change of `state`. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
  /** Loads again. */
  refresh(): Promise<void>;
}

/** The first load of each source: the section attempt it belongs to, and on its way, done or failed. */
const firstLoads = new WeakMap<
  HomeCardSource,
  { readonly attempt: number; readonly load: Promise<void>; failed: boolean }
>();

/**
 * Settles when the source's first load is in, or fails with the reason it couldn't, so a Home card
 * that passes it to React's `use` shows the section's skeleton, then its rows or its error.
 *
 * A failed load is kept for its attempt: React renders a card again after its promise settles,
 * and a new load on each of those renders would ask the engine again and again without ever
 * showing the error (HAL-13360). Only the section's **Try again**, which raises `attempt`, loads
 * again. Once the source has loaded, by then or later, the load is done for every attempt.
 *
 * @example
 * export function RecentRunsView({ list, attempt }: …) {
 *   use(firstLoad(list, attempt));
 *   …
 * }
 */
export function firstLoad(source: HomeCardSource, attempt: number): Promise<void> {
  const known = firstLoads.get(source);
  if (known !== undefined && !known.failed) return known.load;
  if (source.state.loaded) {
    const load = Promise.resolve();
    firstLoads.set(source, { attempt, load, failed: false });
    return load;
  }
  if (known !== undefined && known.attempt === attempt) return known.load;
  const entry = { attempt, load: Promise.resolve(), failed: false };
  entry.load = new Promise<void>((resolve, reject) => {
    let stop = () => {};
    const settle = () => {
      const { loaded, error } = source.state;
      if (!loaded && error === undefined) return;
      stop();
      if (loaded) {
        resolve();
      } else {
        entry.failed = true;
        reject(error);
      }
    };
    stop = source.subscribe(settle);
  });
  firstLoads.set(source, entry);
  // A load that failed before, on the Inbox page or an earlier attempt: load again.
  if (source.state.error !== undefined) void source.refresh();
  return entry.load;
}
