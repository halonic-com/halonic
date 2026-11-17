import { useState } from "react";
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
  /** Puts every file of the item back to its last version, at once, with a toast to undo it; gives the reason when it failed. */
  readonly undo: (item: ChangeItem) => Promise<string | undefined>;
}

/** **Undo these changes** for one item: one toast with Undo on success, the reason on failure. */
export function useUndoItem(list: ChangesList): UndoItem {
  const discarding = useDiscardToasts();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  return {
    busy,
    failure,
    undo: async (item) => {
      setBusy(true);
      setFailure(undefined);
      const reason = await discarding.run(await discardItem(list, item.files), {
        title: discardWords.discarded(item.name),
      });
      setBusy(false);
      setFailure(reason);
      return reason;
    },
  };
}
