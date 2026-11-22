import { ChevronRightIcon, SidePanel, usePresentation } from "@halonicjs/studio-kit";
import type { CloseStack } from "@halonicjs/studio-shell";
import { type ReactNode, useContext, useEffect, useId, useLayoutEffect, useRef } from "react";
import { MapStacked } from "./map-frame.tsx";
import { stackedRowBaseClasses } from "./map-rows.tsx";

const sheetRowsClasses = "-mx-4 -my-3 flex flex-col divide-y divide-border border-b border-border";

const cardClasses =
  "flex w-full flex-col items-start gap-0.5 rounded-md border border-border bg-surface-raised px-3 py-2 text-start text-small text-fg hover:bg-surface-subtle focus-ring";

/** The most cards a side shows; with more it shows one summary card instead (flow-agents 6). */
export const MAX_SIDE_CARDS = 3;

/**
 * A side's summary card (`agents.map.side-summary-card`): its counts ("2 workflows · 1 agent") over
 * the side's name in lower case. It stands where the cards would, so it gets their line, and it
 * opens the side's drawer. In the stacked map it's the summary row, after the side's rows
 * (component specs 15.8). It stands for several kinds, so it has no icon, but its text starts where
 * the names above it do: 16 px, the icon's 20 and the 12 px gap.
 */
export function SummaryCard({
  counts,
  heading,
  open,
  onOpen,
}: {
  readonly counts: string;
  readonly heading: string;
  /** Whether its drawer is open. */
  readonly open: boolean;
  readonly onOpen: (card: HTMLButtonElement) => void;
}) {
  const stacked = useContext(MapStacked);
  const text = (
    <>
      <span className={stacked ? "text-body-strong" : undefined}>{counts}</span>
      <span className={stacked ? "text-small text-fg-muted" : "text-caption text-fg-muted"}>
        {heading.toLowerCase()}
      </span>
    </>
  );
  return (
    <button
      type="button"
      data-map-card=""
      aria-haspopup="dialog"
      aria-expanded={open}
      className={
        stacked
          ? `${stackedRowBaseClasses} ps-12 pe-4 hover:bg-surface-subtle focus-ring-inset`
          : cardClasses
      }
      onClick={(event) => onOpen(event.currentTarget)}
    >
      {stacked ? (
        <>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">{text}</span>
          <span className="size-icon-md shrink-0 text-fg-subtle *:size-full">
            <ChevronRightIcon />
          </span>
        </>
      ) : (
        text
      )}
    </button>
  );
}

/**
 * The drawer a summary card opens (`agents.map.summary-drawer`): over the map's right edge, titled
 * by its side, with every item of the side and its add button last. Opening it moves focus to its
 * title. Esc closes it as the window's `drawer` layer, after a dialog or menu and before a stacked
 * card; while a card covers the map it doesn't count, so Esc closes the card first. Its opener puts
 * focus back. On a phone it's a panel sheet over the map instead (`agents.map.phone-summary-sheet`):
 * the kit's `SidePanel` with Back, its items as the stacked map's rows.
 */
export function SummaryDrawer({
  title,
  closeStack,
  onClose,
  children,
}: {
  readonly title: string;
  readonly closeStack: CloseStack;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const drawer = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  // Kept in a ref, so a new function each render doesn't register the layer again.
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  const sheet = usePresentation() === "phone";

  useLayoutEffect(() => {
    if (!sheet) heading.current?.focus();
  }, [sheet]);

  useEffect(
    () =>
      closeStack.open({
        kind: "drawer",
        close: () => {
          latestClose.current();
          return true;
        },
        isActive: () => drawer.current?.closest("[hidden], [inert]") === null,
      }),
    [closeStack],
  );

  if (sheet) {
    // Over the map, not the window: a card opened from it is the page's, and comes over it.
    return (
      <div
        ref={drawer}
        role="dialog"
        aria-labelledby={titleId}
        data-map-drawer=""
        className="absolute inset-0 z-10 bg-surface"
      >
        <SidePanel title={title} dialogTitleId={titleId} onClose={onClose}>
          {/* Flush to the sheet's edges and under its top bar, which draws the line above them. */}
          <div className={sheetRowsClasses}>
            <MapStacked value={true}>{children}</MapStacked>
          </div>
        </SidePanel>
      </div>
    );
  }
  return (
    <div
      ref={drawer}
      role="dialog"
      aria-labelledby={titleId}
      data-map-drawer=""
      className="absolute inset-y-0 right-0 flex w-80 max-w-full flex-col gap-3 overflow-auto border-s border-border bg-surface-raised p-4 shadow-2"
    >
      <h2 ref={heading} id={titleId} tabIndex={-1} className="text-body-strong text-fg">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
