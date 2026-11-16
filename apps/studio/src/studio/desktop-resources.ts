import type { TauriIpc } from "@halonicjs/studio-services";
import { type ResourceWatch, systemTimers, watchResources } from "@halonicjs/studio-shell";

/**
 * The status bar's memory and free-disk watch for the desktop app (HAL-11118): it reads the
 * shell's `resource_report` command at once and then every minute (`shell.resource-numbers`).
 * The numbers are the app's own memory, the size of the profile folder and the free space on its
 * drive. The served Studio has no such command and gets no watch, so its status bar shows no
 * resources item.
 *
 * A read that fails leaves the item as it was and is tried again the next minute; the reason goes
 * to the console.
 *
 * @example
 * const resources = watchDesktopResources(ipc);
 * // ... later, when the window closes:
 * resources.stop();
 */
export function watchDesktopResources(ipc: TauriIpc): ResourceWatch {
  return watchResources({
    read: () => ipc.invoke("resource_report"),
    timers: systemTimers,
    onError: (error) => {
      console.warn("The resource report can't be read.", error);
    },
  });
}
