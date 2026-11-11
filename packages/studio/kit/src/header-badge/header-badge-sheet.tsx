import { useId } from "react";
import { ChevronRightIcon } from "../icons/chevron-right-icon.tsx";
import { isMenuItem, type MenuEntry, type MenuItem } from "../menu/menu.tsx";
import { SidePanel } from "../side-panel/side-panel.tsx";

/** Props of the kit's `HeaderBadgeSheet`. */
export interface HeaderBadgeSheetProps {
  /** The badge's words, as the sheet's title: "Sample · test model". */
  readonly title: string;
  /** The Menu's description line, as the sheet's first body line. */
  readonly description?: string | undefined;
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

/**
 * What the header badge's menu becomes on a phone (component specs 20.1, 20.2): a panel sheet
 * titled with the badge's words, the Menu's description line as its first body line, then its
 * items as 48px link rows, danger items last. The shell puts it on its page stack when the badge
 * calls `onOpenSheet`; a tap on a row calls the item's `onSelect`.
 *
 * @example
 * <HeaderBadgeSheet title="Sample · test model" description={costLine} entries={sampleEntries} onClose={back} />
 */
export function HeaderBadgeSheet({ title, description, entries, onClose }: HeaderBadgeSheetProps) {
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
      <ul className="-mx-4">
        {ordered.map((item) => (
          <li key={item.id}>
            <LinkRow item={item} />
          </li>
        ))}
      </ul>
    </SidePanel>
  );
}

/** One item as a link row. One that can't be used stays listed, says why if it can, and does nothing. */
function LinkRow({ item }: { readonly item: MenuItem }) {
  const reasonId = useId();
  const unusable = item.disabled === true || item.unavailable !== undefined;
  const tone = item.danger === true ? "text-danger" : "text-fg";
  return (
    <button
      type="button"
      className={`${rowClasses} ${item.disabled === true ? "text-fg-disabled" : tone}`}
      aria-disabled={unusable ? true : undefined}
      aria-describedby={item.unavailable === undefined ? undefined : reasonId}
      onClick={unusable ? undefined : item.onSelect}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`wrap-break-word ${item.unavailable === undefined ? "" : "opacity-45"}`}>
          {item.label}
        </span>
        {item.unavailable === undefined ? null : (
          <span id={reasonId} className="text-small text-fg-muted wrap-break-word">
            {item.unavailable.reason}
          </span>
        )}
      </span>
      <span className="size-icon-md shrink-0 text-fg-subtle *:size-full" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    </button>
  );
}
