import { useId } from "react";
import { ChevronRightIcon } from "../icons/chevron-right-icon.tsx";
import { TickIcon } from "../icons/tick-icon.tsx";
import { isMenuItem, type MenuEntry, type MenuItem, taggedItemName } from "../menu/menu.tsx";
import { SidePanel } from "../side-panel/side-panel.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";

/** Props of the kit's `HeaderBadgeSheet`. */
export interface HeaderBadgeSheetProps {
  /** The badge's words, as the sheet's title: "Sample · test model". */
  readonly title: string;
  /** The Menu's description line, as the sheet's first body line. */
  readonly description?: string | undefined;
  /** One more sentence, in `text-body`, after the description: "To start your own workspace, use Halonic on your computer.". */
  readonly note?: string | undefined;
  /** The Menu's entries. Dividers fall away: every row has its own line under it. */
  readonly entries: readonly MenuEntry[];
  /** Back. */
  readonly onClose: () => void;
}

/**
 * 48px, divided by a `border` line, edge to edge, with a chevron at the right: rows that each
 * open something. Focus is the inset ring, so the list's edges don't clip it.
 */
const rowClasses = [
  "flex w-full min-h-touch items-center gap-3 border-b border-border px-4 py-2 text-left text-body",
  "transition-colors focus-ring-inset",
  "not-aria-disabled:hover:bg-surface-subtle not-aria-disabled:active:bg-surface-subtle",
  "aria-disabled:cursor-not-allowed",
].join(" ");

/** A disabled row's words: `GrayText` in forced colours, as Button's, so it doesn't look usable there (HAL-12946). */
const DISABLED_ROW = "text-fg-disabled text-forced-disabled";

/**
 * What the header badge's menu becomes on a phone (component specs 20.1, 20.2): a panel sheet
 * titled with the badge's words, the Menu's description line as its first body line, then its
 * items as 48px link rows, danger items last. A sheet with a `note` and no entries is a sentence
 * to read, such as the sample chip's on a phone. The shell puts it on its page stack when the badge
 * calls `onOpenSheet`; a tap on a row calls the item's `onSelect`.
 *
 * Any other Menu that has to work on a phone can use it too, such as the workspace menu in a
 * narrow desktop window: an item's detail is its second line, its tag an outline tag, and the
 * checked item has a tick and `aria-current`.
 *
 * @example
 * <HeaderBadgeSheet title="Sample · test model" description={costLine} entries={sampleEntries} onClose={back} />
 */
export function HeaderBadgeSheet({
  title,
  description,
  note,
  entries,
  onClose,
}: HeaderBadgeSheetProps) {
  const items = entries.filter(isMenuItem);
  const ordered = [
    ...items.filter((item) => item.danger !== true),
    ...items.filter((item) => item.danger === true),
  ];
  return (
    <SidePanel title={title} onClose={onClose}>
      {description === undefined ? null : (
        <p className="pb-3 text-small text-fg-muted">{description}</p>
      )}
      {note === undefined ? null : <p className="pb-3 text-body">{note}</p>}
      {ordered.length === 0 ? null : (
        <ul className="-mx-4">
          {ordered.map((item) => (
            <li key={item.id}>
              <LinkRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </SidePanel>
  );
}

/** One item as a link row. One that can't be used stays listed, says why if it can, and does nothing. */
function LinkRow({ item }: { readonly item: MenuItem }) {
  const reasonId = useId();
  const detailId = useId();
  const unusable = item.disabled === true || item.unavailable !== undefined;
  const tone = item.danger === true ? "text-danger" : "text-fg";
  return (
    <button
      type="button"
      className={`${rowClasses} ${item.disabled === true ? DISABLED_ROW : tone}`}
      aria-disabled={unusable ? true : undefined}
      aria-describedby={describedBy([
        item.detail === undefined ? undefined : detailId,
        item.unavailable === undefined ? undefined : reasonId,
      ])}
      aria-label={taggedItemName(item)}
      aria-current={item.checked === true ? true : undefined}
      onClick={unusable ? undefined : item.onSelect}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`wrap-break-word ${item.unavailable === undefined ? "" : "opacity-45"}`}>
          {item.label}
        </span>
        {item.detail === undefined ? null : (
          <span id={detailId} aria-hidden="true" className="truncate text-small text-fg-muted">
            {item.detail}
          </span>
        )}
        {item.unavailable === undefined ? null : (
          <span id={reasonId} className="text-small text-fg-muted wrap-break-word">
            {item.unavailable.reason}
          </span>
        )}
      </span>
      {item.tag === undefined ? null : (
        <span aria-hidden="true" className="inline-flex shrink-0">
          <StatusChip tone="outline">{item.tag}</StatusChip>
        </span>
      )}
      {item.checked === true ? (
        <span className="size-icon-md shrink-0 text-accent *:size-full" aria-hidden="true">
          <TickIcon />
        </span>
      ) : null}
      <span className="size-icon-md shrink-0 text-fg-subtle *:size-full" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

/** The ids the row is described by, or none. */
function describedBy(ids: readonly (string | undefined)[]): string | undefined {
  const present = ids.filter((id) => id !== undefined);
  return present.length === 0 ? undefined : present.join(" ");
}
