import type { ListRow, MenuEntry } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { DetailThenLastLine } from "./detail-then-last-line.tsx";
import type { OverviewItem, OverviewSection } from "./overview-model.ts";
import type { OverviewWords } from "./overview-page.tsx";

/** Opens an item's ⋮ menu below the button that was pressed. */
export type OpenMenu = (item: OverviewItem, element: HTMLElement) => void;

/**
 * Where a row's chips and used-by text go: on its right, or under its name, as on a phone, so the
 * name and the detail keep the row's width.
 */
export type PartsPlace = "right" | "under";

/**
 * The text under an item's name: its detail, and on a phone its used-by text after a " · ", so the
 * kit doesn't move that text to the line's start as it does a chip. When the line is too long, the
 * detail is cut and the used-by text stays whole, as the kit's stacked rows keep their time
 * (HAL-13066). When even a cut detail leaves no room, the used-by text has the line alone, whole and
 * wrapping if it must, and the detail and its " · " aren't shown on that row (HAL-13648). An item that
 * asks for it gets its used-by text on a line of its own, whole and wrapping if it must (HAL-13100).
 */
function textUnderOf(item: OverviewItem, partsPlace: PartsPlace): ReactNode {
  if (partsPlace === "right" || item.usedBy === undefined) {
    return item.detail;
  }
  if (item.detail === undefined) {
    return item.usedBy;
  }
  if (item.usedByOwnLine === true) {
    return (
      <>
        <span className="block truncate">{item.detail}</span>
        <span className="block whitespace-normal wrap-break-word">{item.usedBy}</span>
      </>
    );
  }
  return <DetailThenUsedBy detail={item.detail} usedBy={item.usedBy} />;
}

/**
 * A phone row's "detail · used-by" line. It is a wrapping flex line in which the detail and its dot
 * ask for 5rem, or their own width when that is less; when the used-by text leaves less, the detail
 * wraps onto a line of its own.
 * `flex-wrap-reverse` puts that line below the used-by text, and the detail's box is 0px high, so
 * the line is 0px high too and `overflow-hidden` clips it: the row shows the used-by text alone,
 * never a stray " · ". The text stays in the DOM in reading order, so a screen reader still hears
 * the whole line.
 */
function DetailThenUsedBy({
  detail,
  usedBy,
}: {
  readonly detail: string;
  readonly usedBy: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-wrap-reverse overflow-hidden">
      {/* In a reversed wrap `self-end` is the line's top, so the 0px box's text hangs into the line.
          The 5rem is the box's basis, not its minimum: `max-w-fit` then caps a short detail at its
          own width, so its dot sits right before the used-by text (a minimum would win over the cap
          and leave a gap). A long detail still needs 5rem before it wraps away. */}
      <span className="flex h-0 min-w-0 max-w-fit flex-[1_1_5rem] self-end">
        {/* `h-lh`: stretched to the 0px box, `truncate`'s overflow would clip the detail to nothing. */}
        <span className="h-lh min-w-0 truncate">{detail}</span>
        {/* `whitespace-pre` keeps the spaces round the dot: a flex item would drop them. */}
        <span className="shrink-0 whitespace-pre"> · </span>
      </span>
      <span className="min-w-0 whitespace-normal wrap-break-word">{usedBy}</span>
    </span>
  );
}

/**
 * Everything under an item's name. On a phone its chips get the last line, under the text, rather
 * than a column on the row's right that would take the text's width: at 195px a Workflows row's
 * "2 needs you" left its name 0px (HAL-13976). The chips wrap when they don't fit on one line.
 */
function metaOf(item: OverviewItem, partsPlace: PartsPlace): ReactNode {
  if (partsPlace === "under" && item.chipsBeforeUsedBy === true) {
    return <DetailThenLastLine item={item} />;
  }
  const text = textUnderOf(item, partsPlace);
  if (partsPlace === "right" || item.chips === undefined) {
    return text;
  }
  return (
    <>
      {text === undefined ? null : <span className="block truncate">{text}</span>}
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">{item.chips}</span>
    </>
  );
}

/** The row's right side on a desktop: its chips, then its used-by text. */
function trailingOf(item: OverviewItem, partsPlace: PartsPlace): ReactNode {
  if (partsPlace === "under" || (item.chips === undefined && item.usedBy === undefined)) {
    return undefined;
  }
  return (
    <span className="flex items-center gap-2">
      {item.chips}
      {item.usedBy === undefined ? null : (
        <span className="text-small text-fg-muted">{item.usedBy}</span>
      )}
    </span>
  );
}

/** The kit's rows of one section of the overview, in the feature's words. */
export function rowsOf(
  section: OverviewSection,
  words: OverviewWords,
  menuOf: ((item: OverviewItem) => readonly MenuEntry[]) | undefined,
  openMenu: OpenMenu,
  partsPlace: PartsPlace,
): readonly ListRow[] {
  return section.items.map((item) => {
    const meta = metaOf(item, partsPlace);
    const trailing = trailingOf(item, partsPlace);
    return {
      id: item.id,
      title: item.name,
      ...(meta === undefined ? {} : { meta }),
      ...(item.avatar === undefined ? {} : { avatar: item.avatar }),
      ...(trailing === undefined ? {} : { trailing }),
      ...(item.error === undefined ? {} : { error: item.error }),
      ...(menuOf === undefined || menuOf(item).length === 0
        ? {}
        : {
            more: {
              label: words.moreLabel(item.name),
              onClick: (event) => openMenu(item, event.currentTarget),
            },
          }),
    };
  });
}
