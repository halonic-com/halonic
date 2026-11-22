import type { FirstRunDevice } from "@halonicjs/studio-feature-first-run/api";
import type { RecentStorage } from "@halonicjs/studio-feature-workspace";

/** The storage key of the first run's one state on this device. */
export const FIRST_RUN_STATE = "halonic.first-run.state";

/**
 * Where the first run's state lives for the folder at `location` (`first-run.state`): one key in
 * the page's storage on this device, the same whichever folder is open. Like Recent, a state that
 * can't be read counts as none, and one that can't be written stays as it was, so the first run
 * never stops a folder from opening. The device's `startOver` copies the demo again for Help's
 * **Start over**; it is left out where the window has no Open demo. Another window's save comes in
 * through the page's `storage` event, on `events`: the page's global object unless given.
 *
 * @example
 * const device = firstRunDeviceOf("/docs/Acme sample", { storage: window.localStorage });
 */
export function firstRunDeviceOf(
  location: string,
  {
    storage,
    startOver,
    events = pageEvents(),
  }: {
    readonly storage: RecentStorage;
    readonly startOver?: (copied: () => void) => void;
    readonly events?: EventTarget | undefined;
  },
): FirstRunDevice {
  return {
    ...(startOver === undefined ? {} : { startOver }),
    ...(events === undefined
      ? {}
      : { onChanged: (listener) => onSaved(events, storage, listener) }),
    folder: location,
    read: () => {
      try {
        return storage.getItem(FIRST_RUN_STATE) ?? undefined;
      } catch {
        return undefined;
      }
    },
    write: (text) => {
      try {
        storage.setItem(FIRST_RUN_STATE, text);
      } catch (error) {
        // Storage is full or blocked: the window goes on with the new state, and the next change tries again.
        console.warn("The first run's state couldn't be saved on this device.", error);
      }
    },
  };
}

/**
 * The page's global object, where the browser fires `storage` events. It is reached here rather
 * than passed from `startStudio`, whose file is at the size limit.
 */
function pageEvents(): EventTarget | undefined {
  return globalThis instanceof EventTarget ? globalThis : undefined;
}

/** Calls `listener` when another window saves the first run's state in `storage`. */
function onSaved(events: EventTarget, storage: RecentStorage, listener: () => void): () => void {
  const saved = (event: Event) => {
    const { key, storageArea } = event as StorageEvent;
    // `key` is null when the other window cleared the whole storage, which clears the state too.
    if (storageArea === storage && (key === FIRST_RUN_STATE || key === null)) listener();
  };
  events.addEventListener("storage", saved);
  return () => events.removeEventListener("storage", saved);
}
