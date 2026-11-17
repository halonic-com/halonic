import { useRef, useState } from "react";
import type { ChangeItem } from "../change-items.ts";
import type { ChangesList } from "../changes-list.ts";
import { discardWords } from "../changes-words.ts";
import { discardItem } from "../discard-item.ts";
import { useDiscardToasts } from "./use-discard-toasts.ts";

/** What {@link useUndoItem} gives the screen that offers **Undo these changes**. */
export interface UndoItem {
  /** Whether an undo is running. */
  readonly busy: boolean;
  /** Why the last undo failed; `undefined` after a good one. */
  readonly failure: string | undefined;
  /**
   * The item whose undo waits for an answer because Halonic couldn't keep a copy of what it
   * would put back; `undefined` when nothing waits.
   */
  readonly withoutCopyFor: ChangeItem | undefined;
  /**
   * Puts every file of the item back to its last version, at once, with a toast to undo it; gives
   * the reason when it failed. While one undo runs, another is ignored.
   */
  readonly undo: (item: ChangeItem) => Promise<string | undefined>;
  /** Goes on with the item that waits, with no copy and so no Undo; gives the reason when it failed. */
  readonly undoWithoutCopy: () => Promise<string | undefined>;
  /** Drops the question: nothing was changed. */
  readonly cancelWithoutCopy: () => void;
}

/**
 * **Undo these changes** for one item: one toast with Undo on success, the reason on failure, and
 * one question when no copy can be kept.
 */
export function useUndoItem(list: ChangesList): UndoItem {
  const discarding = useDiscardToasts();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [withoutCopyFor, setWithoutCopyFor] = useState<ChangeItem>();

  async function run(item: ChangeItem, withoutCopy: boolean): Promise<string | undefined> {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      const outcome = await discardItem(list, item.files, { withoutCopy });
      if (outcome.kind === "noCopy") {
        setWithoutCopyFor(item);
        return undefined;
      }
      const reason = await discarding.run(outcome, { title: discardWords.undid(item.name) });
      setFailure(reason);
      return reason;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return {
    busy,
    failure,
    withoutCopyFor,
    undo: (item) => run(item, false),
    undoWithoutCopy: async () => {
      if (withoutCopyFor === undefined) return undefined;
      setWithoutCopyFor(undefined);
      return run(withoutCopyFor, true);
    },
    cancelWithoutCopy: () => setWithoutCopyFor(undefined),
  };
}
