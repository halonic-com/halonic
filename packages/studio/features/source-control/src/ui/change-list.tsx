import {
  Button,
  ContextMenu,
  type ContextMenuTarget,
  List,
  ListHeading,
  type ListRow,
  type MenuEntry,
} from "@halonicjs/studio-kit";
import type { ItemRef } from "@halonicjs/studio-shell";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { ChangeItem } from "../change-items.ts";
import { groupIntoItems, isOpenable } from "../change-items.ts";
import type { ChangedFile, ChangesList } from "../changes-list.ts";
import { discardWords, itemWords, mergeWords, versionWords } from "../changes-words.ts";
import { ItemIcon } from "./item-icon.tsx";
import { UndoPartialCallout } from "./undo-partial-callout.tsx";
import { UndoWithoutCopyDialog } from "./undo-without-copy-dialog.tsx";
import type { ReturnFocus } from "./use-open-item.ts";
import { useUndoItem } from "./use-undo-item.ts";

/** The most rows the list draws; the rest are counted under it, and the developer view lists them all. */
export const ROW_LIMIT = 200;

/** Props for {@link ChangeList}. */
export interface ChangeListProps {
  readonly list: ChangesList;
  /** The items to show, in the order {@link orderItems} gives. */
  readonly items: readonly ChangeItem[];
  /** Opens the item's What changed page. */
  readonly onOpen: (id: string) => void;
  /** Opens the item itself, from the row's ⋮; without it the ⋮ has no Open entry. */
  readonly openItem?: ((item: ItemRef) => void) | undefined;
  /** Where focus goes when the list comes back from a page; `undefined` leaves it alone. */
  readonly returnFocus?: ReturnFocus | undefined;
  /** Called once focus is placed from `returnFocus`, so the caller can forget it. */
  readonly onFocusPlaced?: (() => void) | undefined;
  /** On a phone Create version is a full-width touch button under the heading and count (2.12). */
  readonly phone?: boolean;
  /** The most rows to draw; a test gives a small number to prove the rule without drawing {@link ROW_LIMIT} rows. */
  readonly rowLimit?: number;
}

/** Whether a kind places the entry; otherwise it is one of the "Other files". */
const isItem = (item: ChangeItem) => item.kind !== undefined;

/** What a list of rows needs to say about each item: its icon, name, and kind with one sentence, and its ⋮. */
function rowOf(item: ChangeItem, openMore: (id: string) => MoreHandler): ListRow {
  const meta =
    item.kind === undefined
      ? item.sentence
      : itemWords.kindAndSentence(itemWords.kind[item.kind], item.sentence);
  return {
    id: item.id,
    title: item.name,
    meta,
    icon: <ItemIcon kind={item.kind} />,
    more: { label: itemWords.moreActionsFor(item.name), onClick: openMore(item.id) },
  };
}

/** What the list's ⋮ button gives: the element the menu opens below. */
type MoreHandler = (event: { readonly currentTarget: HTMLElement }) => void;

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
  openItem,
  returnFocus,
  onFocusPlaced,
  phone = false,
  rowLimit = ROW_LIMIT,
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

  const [menu, setMenu] = useState<{ readonly id: string; readonly target: ContextMenuTarget }>();
  const undoing = useUndoItem(list);
  const openMore =
    (id: string): MoreHandler =>
    (event) =>
      setMenu({ id, target: { element: event.currentTarget } });
  const menuItem = items.find((item) => item.id === menu?.id);

  const shown = items.slice(0, rowLimit);
  const itemRows = shown.filter(isItem).map((item) => rowOf(item, openMore));
  const otherRows = shown.filter((item) => !isItem(item)).map((item) => rowOf(item, openMore));
  const hidden = items.length - shown.length;
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
          // Other files is a group inside Since your last version, so a level below it (a11y C3).
          {
            id: "other",
            heading: { name: itemWords.otherFiles, headingLevel: 3 },
            rows: otherRows,
          },
        ]}
        onOpen={onOpen}
      />
      <UndoPartialCallout undoing={undoing} />
      {hidden > 0 ? <p className="text-small text-fg-muted">{itemWords.andMore(hidden)}</p> : null}
      <ContextMenu
        label={menuItem === undefined ? versionWords.sinceLastVersion : menuItem.name}
        entries={
          menuItem === undefined ? [] : menuEntries(menuItem, openItem, undoing.undo, waiting)
        }
        target={menu?.target}
        onClose={() => setMenu(undefined)}
      />
      <UndoWithoutCopyDialog undoing={undoing} />
    </section>
  );
}

/**
 * An item's ⋮: Open it (an agent, a workflow or a routine), a divider, then Undo these changes. Neither
 * is in `danger`: the undo keeps a copy and offers Undo.
 */
function menuEntries(
  item: ChangeItem,
  openItem: ((item: ItemRef) => void) | undefined,
  undo: (item: ChangeItem) => Promise<void>,
  waiting: boolean,
): MenuEntry[] {
  const open: MenuEntry[] =
    openItem !== undefined && isOpenable(item)
      ? [
          {
            id: "open",
            label: itemWords.openNamed(item.name),
            onSelect: () => openItem({ kind: item.kind ?? "", hub: item.hub, id: item.itemId }),
          },
          "divider",
        ]
      : [];
  return [
    ...open,
    {
      id: "undo",
      label: discardWords.undoTheseChanges,
      unavailable: waiting ? { reason: mergeWords.finishFirst } : undefined,
      onSelect: () => void undo(item),
    },
  ];
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
