import { useToastStore } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import type { Version } from "../api.ts";
import type { ChangesList } from "../changes-list.ts";
import { goBackWords, restoreWords } from "../changes-words.ts";
import { goBack, putAsVersion } from "../go-back.ts";
import type { RestoreOutcome } from "../restore-item.ts";

/** A Go back that failed and could not be put back: the folder is left partly gone back. */
export interface PartialGoBack {
  readonly version: Version;
  readonly reason: string;
  /** The files not put back as they were. */
  readonly paths: readonly string[];
}

/** What {@link useGoBack} gives the screens that show a version. */
export interface GoingBack {
  /** Whether a Go back is running. */
  readonly busy: boolean;
  /** The Go back that failed and could not be put back; `undefined` otherwise. */
  readonly partial: PartialGoBack | undefined;
  /**
   * Go back: puts the workspace as the version has it, at once, with a toast to undo it. A failure
   * shows as a danger toast with no Undo, since no file was changed. While one runs, another is
   * ignored.
   */
  readonly goBack: (version: Version) => Promise<void>;
  /** Writes the files of {@link partial} that still differ from its version. */
  readonly retry: () => Promise<void>;
}

/**
 * **Go back to this version** (checklist part 2, 2.9): one toast with Undo on success, a danger
 * toast on failure, and a warning Callout when even putting the files back failed. The list reads
 * again afterwards, so History shows "Before going back" and Changes the files that went back.
 */
export function useGoBack(list: ChangesList): GoingBack {
  const toasts = useToastStore();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState<PartialGoBack>();

  async function run(version: Version, write: () => Promise<RestoreOutcome>): Promise<void> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setPartial(undefined);
    try {
      const outcome = await write();
      await list.refresh();
      if (outcome.kind === "partial") {
        setPartial({ version, reason: outcome.reason, paths: outcome.paths });
        return;
      }
      if (outcome.kind === "failed") {
        toasts?.show({
          tone: "danger",
          title: goBackWords.failed(version.name),
          text: outcome.reason,
        });
        return;
      }
      const title = goBackWords.wentBack(version.name);
      // Nothing differed from the version, so there is nothing to undo.
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
            void undo().then(async (reason) => {
              await list.refresh();
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
    goBack: (version) => run(version, () => goBack(list.source, version.id)),
    retry: async () => {
      if (partial === undefined) return;
      const { version } = partial;
      await run(version, () => putAsVersion(list.source, version.id));
    },
  };
}
