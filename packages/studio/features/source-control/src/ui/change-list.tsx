import { Button, List, ListHeading, PlaceIcon, SettingsIcon } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { ChangeItem } from "../change-items.ts";
import { groupIntoItems } from "../change-items.ts";
import type { ChangedFile, ChangesList } from "../changes-list.ts";
import { itemWords, mergeWords, versionWords } from "../changes-words.ts";
import { ItemChanges } from "./item-changes.tsx";

/** Props for {@link ChangeList}. */
export interface ChangeListProps {
  readonly list: ChangesList;
  readonly files: readonly ChangedFile[];
  /** Whether the developer view is on: it adds Discard and "Discard this part". */
  readonly developer?: boolean;
  /** On a phone Create version is a full-width touch button under the heading and count (2.12). */
  readonly phone?: boolean;
  /** Moves focus to the page's heading, for when the last item goes and the whole list with it. */
  readonly focusHeading?: () => void;
}

/** Whether a kind places the entry; otherwise it is one of the "Other files". */
const isItem = (item: ChangeItem) => item.kind !== undefined;

/** The sidebar's place icon that says most about an item's kind. */
function iconOf(item: ChangeItem): ReactNode {
  if (item.kind === undefined) return <SettingsIcon />;
  const place =
    item.kind === "agent" || item.kind === "workflow" || item.kind === "routine"
      ? (`${item.kind}s` as const)
      : "library";
  return <PlaceIcon name={place} />;
}

/** What a list of rows needs to say about each item: its icon, name and one sentence. */
function rowOf(item: ChangeItem) {
  return { id: item.id, title: item.name, meta: item.sentence, icon: iconOf(item) };
}

/**
 * What changed, one row for each item (checklist part 2, 2.2), under "Since your last version" with
 * its count and Create version; files no kind places are under "Other files". The rows are the
 * kit List: one Tab stop, ↑ ↓ move, Enter opens the item, which shows what changed in it with
 * Undo this change. When an open item is gone, as after Undo these changes, focus moves to the row
 * that took its place, or else to the heading.
 */
export function ChangeList({
  list,
  files,
  developer = false,
  phone = false,
  focusHeading,
}: ChangeListProps) {
  const waitingId = useId();
  const waiting = list.merging;
  const grouped = groupIntoItems(files);
  // The order the rows are drawn in: items, then the files no kind places.
  const items = [...grouped.filter(isItem), ...grouped.filter((item) => !isItem(item))];
  const [openId, setOpenId] = useState<string>();
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const openIndex = useRef(-1);
  const focusInside = useRef(false);
  const heading = useRef(focusHeading);
  heading.current = focusHeading;
  // With the last item gone the list goes too; focus it had inside goes to the page's heading.
  useEffect(
    () => () => {
      if (focusInside.current) heading.current?.();
    },
    [],
  );
  const latestItems = useRef(items);
  latestItems.current = items;
  const open = items.find((item) => item.id === openId);
  if (open !== undefined) openIndex.current = items.indexOf(open);
  // `items` is a new array on every render; the effect below follows the open item being there.
  const isOpenPresent = open !== undefined;

  useEffect(() => {
    const focusLost = !document.activeElement || document.activeElement === document.body;
    if (isOpenPresent) {
      // The last change an Undo button belonged to is gone, and the button with it.
      if (focusLost) panelHeading.current?.focus();
      return;
    }
    if (openId === undefined) return;
    // The open item is gone, as after Undo these changes: the row that took its place, else the heading.
    setOpenId(undefined);
    if (focusLost) focusRowOrHeading(region.current, latestItems.current[openIndex.current]);
  }, [openId, isOpenPresent]);

  const itemRows = items.filter(isItem).map(rowOf);
  const otherRows = items.filter((item) => !isItem(item)).map(rowOf);
  const sinceHeading = { name: versionWords.sinceLastVersion, detail: countChip(items.length) };
  return (
    <section
      aria-label={versionWords.sinceLastVersion}
      ref={region}
      className="flex flex-col gap-3"
      onFocus={() => {
        focusInside.current = true;
      }}
      onBlur={(event) => {
        focusInside.current = event.currentTarget.contains(event.relatedTarget);
      }}
    >
      {phone ? (
        <Button
          variant="secondary"
          size="touch"
          block
          unavailable={waiting ? { reason: waitingId } : undefined}
          onClick={() => list.startVersion()}
        >
          {versionWords.createVersion}
        </Button>
      ) : (
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            unavailable={waiting ? { reason: waitingId } : undefined}
            onClick={() => list.startVersion()}
          >
            {versionWords.createVersion}
          </Button>
        </div>
      )}
      {waiting ? (
        <span id={waitingId} className="text-small text-fg-muted">
          {mergeWords.finishFirst}
        </span>
      ) : null}
      {/* The List drops a group with no rows, heading and count with it; with only Other files changed, this heading stands in. */}
      {itemRows.length === 0 ? <ListHeading {...sinceHeading} headingLevel={2} /> : null}
      <List
        label={versionWords.sinceLastVersion}
        groupHeadingLevel={2}
        groups={[
          {
            id: "items",
            heading: sinceHeading,
            rows: itemRows,
          },
          { id: "other", heading: { name: itemWords.otherFiles }, rows: otherRows },
        ]}
        {...(openId === undefined ? {} : { current: openId })}
        onOpen={(id) => setOpenId(id === openId ? undefined : id)}
      />
      {open === undefined ? null : (
        <ItemChanges list={list} item={open} developer={developer} headingRef={panelHeading} />
      )}
    </section>
  );
}

/** The count beside the heading, with its word so a screen reader says what it counts. */
function countChip(count: number): ReactNode {
  return (
    <span className="text-small rounded-full border border-border px-2 normal-case text-fg-muted">
      {versionWords.itemCount(count)}
    </span>
  );
}

/** Puts focus on `next`'s row, or on the list's first heading when there is no next row. */
function focusRowOrHeading(region: HTMLElement | null, next: ChangeItem | undefined): void {
  const row =
    next === undefined
      ? null
      : region?.querySelector<HTMLElement>(
          `[data-row-id="${CSS.escape(next.id)}"] [role="gridcell"]`,
        );
  if (row) {
    row.focus();
    return;
  }
  const heading = region?.querySelector<HTMLElement>("h2");
  if (heading === null || heading === undefined) return;
  // A heading is not focusable by itself; this one only takes focus from code.
  heading.tabIndex = -1;
  heading.focus();
}
