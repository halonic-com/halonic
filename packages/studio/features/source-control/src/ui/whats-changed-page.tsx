import { Button } from "@halonicjs/studio-kit";
import type { ItemRef } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef, useState } from "react";
import type { ChangeItem } from "../change-items.ts";
import type { ChangesList } from "../changes-list.ts";
import { discardWords, pageWords } from "../changes-words.ts";
import { discardItem } from "../discard-item.ts";
import { ItemChanges, WaitingNote } from "./item-changes.tsx";
import { useDiscardToasts } from "./use-discard-toasts.ts";

/** The kinds a page can open from here: the ones the Changes list shows with a place icon. */
const openableKinds: readonly string[] = ["agent", "workflow", "routine"];

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
export function WhatChangedPage({
  list,
  item,
  developer,
  openItem,
  onBack,
}: WhatChangedPageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const discarding = useDiscardToasts();
  const waitingId = useId();
  const headingId = useId();

  async function undoTheseChanges() {
    setBusy(true);
    setFailure(undefined);
    const reason = await discarding.run(await discardItem(list, item.files), {
      title: discardWords.discarded(item.files.length),
      text: item.name,
    });
    setBusy(false);
    setFailure(reason);
  }

  const canOpen =
    openItem !== undefined &&
    item.kind !== undefined &&
    openableKinds.includes(item.kind);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <span className="self-start">
        <Button variant="ghost" size="sm" onClick={onBack}>
          {pageWords.back}
        </Button>
      </span>
      <header className="flex items-center gap-3">
        <h1
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="text-title flex-1 outline-none"
        >
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
          onClick={() => void undoTheseChanges()}
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
    </section>
  );
}
