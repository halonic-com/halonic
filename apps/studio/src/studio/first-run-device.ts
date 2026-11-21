import type { FirstRunDevice } from "@halonicjs/studio-feature-first-run/api";
import type { RecentStorage } from "@halonicjs/studio-feature-workspace";

/** The storage key of the first run's one state on this device. */
export const FIRST_RUN_STATE = "halonic.first-run.state";

/**
 * Where the first run's state lives for the folder at `location` (`first-run.state`): one key in
 * the page's storage on this device, the same whichever folder is open. Like Recent, a state that
 * can't be read counts as none, and one that can't be written stays as it was, so the first run
 * never stops a folder from opening. The device's `startOver` copies the demo again for Help's
 * **Start over**; it is left out where the window has no Open demo.
 *
 * @example
 * const device = firstRunDeviceOf("/docs/Acme sample", { storage: window.localStorage });
 */
export function firstRunDeviceOf(
  location: string,
  { storage, startOver }: { readonly storage: RecentStorage; readonly startOver?: () => void },
): FirstRunDevice {
  return {
    ...(startOver === undefined ? {} : { startOver }),
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
