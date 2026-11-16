import { WarningIcon } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { type AnnouncerTimers, systemTimers } from "../announcer/timers.ts";
import type { ResourceReading, ResourceWatch } from "./resource-watch.ts";
import { freeSpaceText, halonicMemoryBytes, memoryText, resourceWords } from "./resource-words.ts";

/** How often the item reads the report again: 30 s (microcopy 22 F12). */
export const resourceItemRefreshMs = 30_000;

/** Props for {@link ResourceStatusItem}. */
export interface ResourceStatusItemProps {
  /** The shell's view of the engine's resource report. */
  readonly watch: ResourceWatch;
  /** Timers for the 30 s refresh; tests pass fake ones. */
  readonly timers?: AnnouncerTimers;
}

/**
 * Halonic's memory and free disk space, for the status bar's right end after the items features
 * added: "230 MB · 48 GB free" in the muted colour (`shell.resource-status-item`, microcopy 22
 * F12). Below 1 GB free it becomes the warning "Low on disk space: 0.8 GB free" (F11), and goes
 * back by itself when the disk has room again.
 *
 * It's plain text, not a button: there's no details page for it to open. It reads the report
 * every 30 s and when the window comes to the front. Until a reading arrives, it shows nothing.
 * From 900px it shows; between 900 and 1199px the normal item gives way to an item marked
 * `data-status-update` (Restart to update) in the same status bar, while the low-disk warning stays.
 *
 * The status bar isn't a live region, and a state that lasts isn't announced: the item's name is
 * also its tooltip.
 *
 * @example
 * <ShellFrame statusBar={<ResourceStatusItem watch={resources} />} …>
 */
export function ResourceStatusItem({ watch, timers = systemTimers }: ResourceStatusItemProps) {
  const reading = useLatestReading(watch);
  useRefreshing(watch, timers);
  if (reading === undefined) {
    return null;
  }
  const free = freeSpaceText(reading.report.freeDiskBytes);
  if (reading.lowDisk) {
    return <LowDisk free={free} />;
  }
  const memory = memoryText(halonicMemoryBytes(reading.report));
  const name = resourceWords.usageName(memory, free);
  return (
    <span
      title={name}
      className="hidden shrink-0 whitespace-nowrap max-[1199px]:group-has-[[data-status-update]]/bar:hidden wide:inline"
    >
      <span aria-hidden="true">{resourceWords.usage(memory, free)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

function LowDisk({ free }: { readonly free: string }) {
  const name = resourceWords.lowDiskName(free);
  return (
    <span
      title={name}
      className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-warning wide:flex"
    >
      <span aria-hidden="true" className="size-icon-sm shrink-0 *:size-full">
        <WarningIcon />
      </span>
      <span aria-hidden="true">{resourceWords.lowDisk(free)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

/** The watch's last reading, kept up to date with every new one. */
function useLatestReading(watch: ResourceWatch): ResourceReading | undefined {
  const subscribe = useCallback((onChange: () => void) => watch.on("resources", onChange), [watch]);
  return useSyncExternalStore(subscribe, () => watch.latest);
}

/** Reads the report every 30 s and when the window comes to the front, until the item goes. */
function useRefreshing(watch: ResourceWatch, timers: AnnouncerTimers): void {
  useEffect(() => {
    let timer: unknown;
    const refresh = (): void => {
      watch.check("status-bar").catch((error: unknown) => {
        // The item keeps its last numbers; the engine's own minute check reports its failures too.
        console.error("Couldn't read Halonic's resource use.", error);
      });
    };
    const schedule = (): void => {
      timer = timers.setTimeout(() => {
        refresh();
        schedule();
      }, resourceItemRefreshMs);
    };
    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      timers.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [watch, timers]);
}
