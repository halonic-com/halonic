import { Button } from "@halonicjs/studio-kit";
import type { ItemRef } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef } from "react";
import { type ChangeItem, isOpenable } from "../change-items.ts";
import type { ChangesList } from "../changes-list.ts";
import { discardWords, pageWords } from "../changes-words.ts";
import { ItemChanges, WaitingNote } from "./item-changes.tsx";
import { UndoWithoutCopyDialog } from "./undo-without-copy-dialog.tsx";
import { useUndoItem } from "./use-undo-item.ts";

/** Props for {@link WhatChangedPage}. */
export interface WhatChangedPageProps {
  readonly list: ChangesList;
  readonly item: ChangeItem;
  /** Whether the developer view is on: it adds Discard and "Discard this part". */
  readonly developer: boolean;
  /** Opens the item itself; without it the page has no Open button. */
  readonly openItem?: ((item: ItemRef) => void) | undefined;
  readonly onBack: () => void;
}

/**
 * What changed in one item, as its own page in this tab (checklist part 2, 2.4): Back to Changes,
 * the item's name as the `h1`, **Undo these changes** and Open workflow, then the changes of each
 * of its files. Focus starts on the heading, so a screen reader says where it is.
 */
export function WhatChangedPage({ list, item, developer, openItem, onBack }: WhatChangedPageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const undoing = useUndoItem(list);
  const { busy, failure, undo } = undoing;
  const waitingId = useId();
  const headingId = useId();

  const canOpen = openItem !== undefined && isOpenable(item);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <span className="self-start">
        <Button variant="ghost" size="sm" onClick={onBack}>
          {pageWords.back}
        </Button>
      </span>
      <header className="flex items-center gap-3">
        <h1 id={headingId} ref={heading} tabIndex={-1} className="text-title flex-1 outline-none">
          {item.name}
        </h1>
        {canOpen ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              openItem({
                kind: item.kind ?? "",
                hub: item.hub,
                id: item.itemId,
              })
            }
          >
            {pageWords.openItem(item.kind ?? "")}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          busy={busy}
          unavailable={list.merging ? { reason: waitingId } : undefined}
          onClick={() => void undo(item)}
        >
          {discardWords.undoTheseChanges}
        </Button>
      </header>
      <WaitingNote list={list} id={waitingId} />
      {failure === undefined ? null : (
        <span role="alert" className="text-small text-danger">
          {discardWords.failed}. {failure}
        </span>
      )}
      <ItemChanges list={list} item={item} developer={developer} />
      {/* A failure after the question shows where every failure of this page shows. */}
      <UndoWithoutCopyDialog undoing={undoing} onFailed={() => undefined} />
    </section>
  );
}
