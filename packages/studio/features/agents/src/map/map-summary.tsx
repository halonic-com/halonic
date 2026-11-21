import type { CloseStack } from "@halonicjs/studio-shell";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from "react";

/** The most cards a side shows; with more it shows one summary card instead (flow-agents 6). */
export const MAX_SIDE_CARDS = 3;

/**
 * A side's summary card (`agents.map.side-summary-card`): its counts ("2 workflows · 1 agent") over
 * the side's name in lower case. It stands where the cards would, so it gets their line, and it
 * opens the side's drawer.
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
  return (
    <button
      type="button"
      data-map-card=""
      aria-haspopup="dialog"
      aria-expanded={open}
      className="flex w-full flex-col items-start gap-0.5 rounded-md border border-border bg-surface-raised px-3 py-2 text-start text-small text-fg hover:bg-surface-subtle focus-ring"
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <span>{counts}</span>
      <span className="text-caption text-fg-muted">{heading.toLowerCase()}</span>
    </button>
  );
}

/**
 * The drawer a summary card opens (`agents.map.summary-drawer`): over the map's right edge, titled
 * by its side, with every item of the side and its add button last. Opening it moves focus to its
 * title. Esc closes it as the window's `drawer` layer, after a dialog or menu and before a stacked
 * card; while a card covers the map it doesn't count, so Esc closes the card first. Its opener puts
 * focus back.
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

  useLayoutEffect(() => heading.current?.focus(), []);

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
