import { Button, FileIcon, List, ListHeading, PlaceIcon } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef } from "react";
import type { ChangeItem } from "../change-items.ts";
import { groupIntoItems } from "../change-items.ts";
import type { ChangedFile, ChangesList } from "../changes-list.ts";
import { itemWords, mergeWords, versionWords } from "../changes-words.ts";
import type { ReturnFocus } from "./use-open-item.ts";

/** Props for {@link ChangeList}. */
export interface ChangeListProps {
  readonly list: ChangesList;
  /** The items to show, in the order {@link orderItems} gives. */
  readonly items: readonly ChangeItem[];
  /** Opens the item's What changed page. */
  readonly onOpen: (id: string) => void;
  /** Where focus goes when the list comes back from a page; `undefined` leaves it alone. */
  readonly returnFocus?: ReturnFocus | undefined;
  /** Called once focus is placed from `returnFocus`, so the caller can forget it. */
  readonly onFocusPlaced?: (() => void) | undefined;
  /** On a phone Create version is a full-width touch button under the heading and count (2.12). */
  readonly phone?: boolean;
}

/** Whether a kind places the entry; otherwise it is one of the "Other files". */
const isItem = (item: ChangeItem) => item.kind !== undefined;

/** The sidebar's place icon that says most about an item's kind. */
function iconOf(item: ChangeItem): ReactNode {
  if (item.kind === undefined) return <FileIcon />;
  const place =
    item.kind === "agent" || item.kind === "workflow" || item.kind === "routine"
      ? (`${item.kind}s` as const)
      : "library";
  return <PlaceIcon name={place} />;
}

/** What a list of rows needs to say about each item: its icon, name, and kind with one sentence. */
function rowOf(item: ChangeItem) {
  const meta =
    item.kind === undefined
      ? item.sentence
      : itemWords.kindAndSentence(itemWords.kind[item.kind], item.sentence);
  return { id: item.id, title: item.name, meta, icon: iconOf(item) };
}

/** The order the rows are drawn in: items, then the files no kind places. */
export function orderItems(files: readonly ChangedFile[]): ChangeItem[] {
  const grouped = groupIntoItems(files);
  return [...grouped.filter(isItem), ...grouped.filter((item) => !isItem(item))];
}

/**
 * What changed, one row for each item (checklist part 2, 2.2), under "Since your last version" with
 * its count and Create version; files no kind places are under "Other files". The rows are the
 * kit List: one Tab stop, ↑ ↓ move, Enter opens the item's What changed page. When the list comes
 * back from that page, focus goes to the row it was opened from, or the one that took its place.
 */
export function ChangeList({
  list,
  items,
  onOpen,
  returnFocus,
  onFocusPlaced,
  phone = false,
}: ChangeListProps) {
  const waitingId = useId();
  const waiting = list.merging;
  const region = useRef<HTMLElement>(null);
  const placeFocus = useRef(returnFocus);
  const focusPlaced = useRef(onFocusPlaced);
  focusPlaced.current = onFocusPlaced;
  const latestItems = useRef(items);
  latestItems.current = items;
  useEffect(() => {
    const target = placeFocus.current;
    if (target === undefined) return;
    const next =
      latestItems.current.find((item) => item.id === target.id) ??
      latestItems.current[target.index];
    focusRowOrHeading(region.current, next);
    focusPlaced.current?.();
  }, []);

  const itemRows = items.filter(isItem).map(rowOf);
  const otherRows = items.filter((item) => !isItem(item)).map(rowOf);
  const sinceHeading = { name: versionWords.sinceLastVersion, detail: countChip(items.length) };
  return (
    <section
      aria-label={versionWords.sinceLastVersion}
      ref={region}
      className="flex flex-col gap-3"
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
        onOpen={onOpen}
      />
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
