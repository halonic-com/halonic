import { useToastStore } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import type { ChangeItem } from "../change-items.ts";
import type { ChangesList } from "../changes-list.ts";
import { discardWords } from "../changes-words.ts";
import { discardItem } from "../discard-item.ts";
import { useDiscardToasts } from "./use-discard-toasts.ts";

/** An undo that failed and could not be rolled back: the item is left half undone. */
export interface PartialUndo {
  readonly item: ChangeItem;
  readonly reason: string;
  /** The files not put back as they were. */
  readonly paths: readonly string[];
}

/** What {@link useUndoItem} gives the screen that offers **Undo these changes**. */
export interface UndoItem {
  /** Whether an undo is running. */
  readonly busy: boolean;
  /**
   * The undo that failed and whose roll-back failed too; `undefined` otherwise. The screen
   * shows it in a Callout with Try again, which is `retry`.
   */
  readonly partial: PartialUndo | undefined;
  /**
   * The item whose undo waits for an answer because Halonic couldn't keep a copy of what it
   * would put back; `undefined` when nothing waits.
   */
  readonly withoutCopyFor: ChangeItem | undefined;
  /**
   * Puts every file of the item back to its last version, at once, with a toast to undo it. A
   * failure shows as a danger toast with no Undo, since nothing was changed. While one undo
   * runs, another is ignored.
   */
  readonly undo: (item: ChangeItem) => Promise<void>;
  /** Goes on with the item that waits, with no copy and so no Undo. */
  readonly undoWithoutCopy: () => Promise<void>;
  /** Drops the question: nothing was changed. */
  readonly cancelWithoutCopy: () => void;
  /**
   * Runs the undo again for the item of {@link partial}, read again, so only the files still
   * changed are put back; clears the warning when none are left.
   */
  readonly retry: () => Promise<void>;
}

/**
 * **Undo these changes** for one item: one toast with Undo on success, a danger toast on failure,
 * a warning Callout when even the roll-back failed, and one question when no copy can be kept.
 */
export function useUndoItem(list: ChangesList): UndoItem {
  const discarding = useDiscardToasts();
  const toasts = useToastStore();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState<PartialUndo>();
  const [withoutCopyFor, setWithoutCopyFor] = useState<ChangeItem>();

  async function run(item: ChangeItem, withoutCopy: boolean): Promise<void> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setPartial(undefined);
    try {
      const outcome = await discardItem(list, item.files, { withoutCopy });
      if (outcome.kind === "noCopy") {
        setWithoutCopyFor(item);
        return;
      }
      if (outcome.kind === "partial") {
        setPartial({ item, reason: outcome.reason, paths: outcome.paths });
        return;
      }
      const reason = await discarding.run(outcome, { title: discardWords.undid(item.name) });
      if (reason !== undefined) {
        toasts?.show({ tone: "danger", title: discardWords.failed, text: reason });
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return {
    busy,
    partial,
    withoutCopyFor,
    undo: (item) => run(item, false),
    undoWithoutCopy: async () => {
      if (withoutCopyFor === undefined) return;
      setWithoutCopyFor(undefined);
      await run(withoutCopyFor, true);
    },
    cancelWithoutCopy: () => setWithoutCopyFor(undefined),
    retry: async () => {
      if (partial === undefined) return;
      // Some files went back already, so undo what the list reads as still changed now.
      await list.refresh();
      const current = list.items.find((item) => item.id === partial.item.id);
      if (current === undefined) setPartial(undefined);
      else await run(current, false);
    },
  };
}
