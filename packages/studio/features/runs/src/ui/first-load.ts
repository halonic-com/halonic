import type { RunsList } from "../runs-list.ts";

/** The first load of each list: on its way, or done. */
const firstLoads = new WeakMap<RunsList, Promise<void>>();

/**
 * Settles when the list's first load is in, or fails with the reason it couldn't, so the section
 * shows its skeleton, then its rows or its error. A failed load is forgotten, so the section's
 * **Try again**, which mounts the card again, loads the runs again.
 */
export function firstLoad(list: RunsList): Promise<void> {
  const known = firstLoads.get(list);
  if (known !== undefined) return known;
  if (list.state.loaded) {
    const done = Promise.resolve();
    firstLoads.set(list, done);
    return done;
  }
  const load = new Promise<void>((resolve, reject) => {
    let stop = () => {};
    const settle = () => {
      const { loaded, error } = list.state;
      if (!loaded && error === undefined) return;
      stop();
      if (loaded) {
        resolve();
      } else {
        firstLoads.delete(list);
        reject(error);
      }
    };
    stop = list.subscribe(settle);
  });
  firstLoads.set(list, load);
  // A load that failed before: this is Try again, so load again.
  if (list.state.error !== undefined) void list.refresh();
  return load;
}
