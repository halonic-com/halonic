import { useToastStore } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import type { Version } from "../api.ts";
import type { VersionItem } from "../change-items.ts";
import type { ChangesList } from "../changes-list.ts";
import { restoreWords } from "../changes-words.ts";
import { restoreItem } from "../restore-item.ts";

/** A restore that failed and could not be put back: the item is left partly restored. */
export interface PartialRestore {
  readonly version: Version;
  readonly item: VersionItem;
  readonly reason: string;
  /** The files not put back as they were. */
  readonly paths: readonly string[];
}

/** What {@link useRestoreItem} gives the screens that show a version's items. */
export interface RestoreItem {
  /** Whether a restore is running. */
  readonly busy: boolean;
  /** The restore that failed and could not be put back; `undefined` otherwise. */
  readonly partial: PartialRestore | undefined;
  /**
   * Restore just this: puts the item as the version has it, at once, with a toast to undo it. A
   * failure shows as a danger toast with no Undo, since nothing was changed. While one restore
   * runs, another is ignored.
   */
  readonly restore: (version: Version, item: VersionItem) => Promise<void>;
  /** Runs the restore of {@link partial} again; the files already restored are left as they are. */
  readonly retry: () => Promise<void>;
}

/**
 * **Restore just this** for one item of a version (checklist part 2, 2.9): one toast with Undo on
 * success, a danger toast on failure, and a warning Callout when even putting the files back failed.
 */
export function useRestoreItem(list: ChangesList): RestoreItem {
  const toasts = useToastStore();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState<PartialRestore>();

  async function run(version: Version, item: VersionItem): Promise<void> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setPartial(undefined);
    try {
      const outcome = await restoreItem(list.source, version.id, item.paths);
      if (outcome.kind === "partial") {
        setPartial({ version, item, reason: outcome.reason, paths: outcome.paths });
        return;
      }
      if (outcome.kind === "failed") {
        toasts?.show({
          tone: "danger",
          title: restoreWords.failed(item.name),
          text: outcome.reason,
        });
        return;
      }
      const title = restoreWords.restored(item.name, version.name);
      if (outcome.kind === "unchanged") {
        toasts?.show({ tone: "success", title });
        return;
      }
      const { undo } = outcome;
      toasts?.show({
        tone: "success",
        title,
        action: {
          label: restoreWords.undo,
          onClick: () =>
            void undo().then((reason) => {
              if (reason === undefined) return;
              toasts.show({ tone: "danger", title: restoreWords.undoFailed, text: reason });
            }),
        },
      });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return {
    busy,
    partial,
    restore: run,
    retry: async () => {
      if (partial !== undefined) await run(partial.version, partial.item);
    },
  };
}
