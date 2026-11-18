import type { ToastStore } from "@halonicjs/studio-kit";
import type { SaveState } from "@halonicjs/studio-shell";
import { FILE_HUB, FILE_KIND, fileName } from "./file-item.ts";
import type { FilesHost } from "./files-host.ts";
import { filesWords } from "./files-words.ts";

/** What {@link followFilesHost} shows things with. */
export interface FollowFilesParts {
  readonly host: Pick<FilesHost, "outside" | "subscribe" | "onReloaded" | "onWatchLimit">;
  /** The window's toasts, for the reload toast and the watch's file limit. */
  readonly toasts: Pick<ToastStore, "show">;
  /** The workspace's save state, whose note says "1 item not saved · Compare". */
  readonly saving: Pick<SaveState, "holdForOutsideChange" | "releaseHold">;
  /** Opens a file's tab, where its strip offers Compare. */
  readonly open: (path: string) => void;
}

/** The save state's key for a file: the same as its tab's. */
function holdKey(path: string): string {
  return `${FILE_KIND}/${FILE_HUB}/${path}`;
}

/**
 * Shows what happens to the workspace's files outside Halonic, wherever the user is
 * (`files.follow-host`): one toast for each batch taken in ("Reloaded a.agent.yaml: changed outside
 * Halonic", "Reloaded 12 files changed outside Halonic"), and the toolbar's "1 item not saved ·
 * Compare" for each file held for Compare. When the workspace has too many files to watch, one
 * warning toast says so and stays until it's closed. Returns the way to stop.
 *
 * @example
 * const stop = followFilesHost({ host, toasts: shell.toasts, saving: workspace.saving, open });
 */
export function followFilesHost({ host, toasts, saving, open }: FollowFilesParts): () => void {
  const held = new Set<string>();
  const sync = (): void => {
    const now = host.outside();
    for (const path of held) {
      if (now.has(path)) continue;
      held.delete(path);
      saving.releaseHold(holdKey(path));
    }
    for (const path of now.keys()) {
      // Held again keeps its place in the queue, so the note keeps naming the one held longest.
      held.add(path);
      saving.holdForOutsideChange({ key: holdKey(path), title: fileName(path) }, () => open(path));
    }
  };
  sync();
  const stopSync = host.subscribe(sync);
  const stopReloads = host.onReloaded((paths) => {
    toasts.show({ tone: "info", title: filesWords.reloaded(paths.map(fileName)) });
  });
  const stopWatchLimit = host.onWatchLimit?.((reason) => {
    toasts.show({ tone: "warning", title: reason, sticky: true });
  });
  return () => {
    stopSync();
    stopReloads();
    stopWatchLimit?.();
  };
}
