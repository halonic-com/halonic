import {
  type FocusEvent,
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "../button/button.tsx";
import { ListHeading, type ListHeadingProps } from "../list-heading/list-heading.tsx";
import { SkeletonBar, type SkeletonBarWidth } from "../skeleton-bar/skeleton-bar.tsx";
import { boxClasses, type ListLook, lineClasses } from "./list-lines.ts";
import type { ListColumn } from "./list-props.ts";
import { columnKey, columnWidthClasses } from "./row-columns.tsx";

/** The skeleton waits this long before it shows, so a fast load doesn't flash. */
export const SKELETON_AFTER_MS = 300;

/** After this long the list says it's still loading and offers Try again. */
export const STILL_LOADING_AFTER_MS = 10_000;

/** The shape of the rows that are coming, so the page doesn't jump when they arrive. */
export interface ListSkeletonShape {
  /** The rows' icon (20px) or avatar (28px). */
  readonly leading?: "icon" | "avatar";
  /** The rows have a chip or a value on the right. */
  readonly trailing?: boolean;
}

/**
 * The title and meta bars' widths, about 40% and 70% of the text column, a little different in
 * each row. Fixed, never random, so tests and screenshots are stable.
 */
const barWidths: readonly { title: SkeletonBarWidth; meta: SkeletonBarWidth }[] = [
  { title: "2/5", meta: "7/10" },
  { title: "1/2", meta: "3/5" },
  { title: "1/3", meta: "2/3" },
];

type Wait = "early" | "showing" | "slow";

/** Where the wait is: too early to show anything, showing the skeleton, or taking long. */
function useWait(): Wait {
  const [wait, setWait] = useState<Wait>("early");
  useEffect(() => {
    const show = setTimeout(() => setWait("showing"), SKELETON_AFTER_MS);
    const slow = setTimeout(() => setWait("slow"), STILL_LOADING_AFTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(slow);
    };
  }, []);
  return wait;
}

export interface ListSkeletonProps {
  readonly look: ListLook;
  readonly phone: boolean;
  /**
   * The List's heading. A 48px bar takes its place, so hub sections line up, and the heading stays
   * for screen readers, so heading navigation still finds the section.
   */
  readonly heading: Pick<ListHeadingProps, "name" | "detail" | "headingLevel"> | undefined;
  /** The List has groups: a heading bar stands above the box, where the first group's heading goes. */
  readonly grouped: boolean;
  /** The List's columns: from 800px the skeleton rows have a bar in each. */
  readonly columns: readonly ListColumn[] | undefined;
  readonly shape: ListSkeletonShape;
  /** What the status line says: "Loading skills". */
  readonly label: string;
  readonly onRetry: (() => void) | undefined;
  readonly onFocus: () => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
}

/**
 * A List while it loads (kit 19.3): three still rows in the real rows' shape, hidden from screen
 * readers, which hear the status line instead. Nothing shows for the first 300ms. After 10 seconds
 * "Still loading" and Try again show under the rows; the skeleton stays.
 *
 * The status line sits next to the `aria-busy` block, not in it: screen readers may hold back
 * changes inside a busy element until it's done, and this one is never done while it shows.
 */
export function ListSkeleton({
  look,
  phone,
  heading,
  grouped,
  columns,
  shape,
  label,
  onRetry,
  onFocus,
  onBlur,
}: ListSkeletonProps) {
  const wait = useWait();
  const status = { early: "", showing: label, slow: "Still loading" }[wait];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: it only notes that focus is on Try again, inside it
    <div onFocus={onFocus} onBlur={onBlur}>
      {heading === undefined ? null : (
        <div className="sr-only">
          <ListHeading {...heading} />
        </div>
      )}
      {/* There from the start, so screen readers announce the text when it arrives. */}
      <span role="status" className="sr-only">
        {status}
      </span>
      <div aria-busy="true">
        {wait === "early" ? null : (
          <>
            {grouped ? <HeadingBar /> : null}
            {/* Nothing in it takes focus, so it can clip the rows to the box's corners. */}
            <div
              aria-hidden="true"
              className={`overflow-hidden ${boxClasses[look]} ${columns === undefined ? "" : "@container"}`}
            >
              {/* The heading is the box's first line, as in the real List. */}
              {heading === undefined ? null : <HeadingBar />}
              {barWidths.map((widths, index) => {
                const line = index === 0 ? "" : lineClasses[look].main;
                const row = <SkeletonRow widths={widths} phone={phone} shape={shape} line={line} />;
                if (columns === undefined || phone) {
                  return <Fragment key={widths.title}>{row}</Fragment>;
                }
                // From 800px the columns' row shows, below it the stacked row. The skeleton rows
                // have no checkbox or More cell, so the box is what's measured.
                return (
                  <div key={widths.title} className={line}>
                    <ColumnsSkeletonRow widths={widths} columns={columns} />
                    <div className="@list-wide:hidden">
                      <SkeletonRow widths={widths} phone={phone} shape={shape} line="" />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {wait === "slow" ? <StillLoading onRetry={onRetry} /> : null}
      </div>
    </div>
  );
}

/** In the heading's place, at the height of its one line of caption text. */
function HeadingBar() {
  return (
    <div aria-hidden="true" className="flex h-4 items-center px-4 pt-4 pb-1 box-content">
      <SkeletonBar kind="heading" />
    </div>
  );
}

function SkeletonRow({
  widths,
  phone,
  shape,
  line,
}: {
  readonly widths: { title: SkeletonBarWidth; meta: SkeletonBarWidth };
  readonly phone: boolean;
  readonly shape: ListSkeletonShape;
  /** The line above it: none on the first row. */
  readonly line: string;
}) {
  // A real row with a meta line: 56px, or at least 64px on a phone.
  const height = phone ? "min-h-16 py-3" : "min-h-14";
  return (
    <div className={`flex items-center gap-3 bg-surface px-4 ${height} ${line}`}>
      {shape.leading === undefined ? null : <SkeletonBar kind={shape.leading} />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <SkeletonBar kind="title" width={widths.title} />
        <SkeletonBar kind="meta" width={widths.meta} />
      </div>
      {shape.trailing === true ? <SkeletonBar kind="trailing" /> : null}
    </div>
  );
}

/** A bar in each column, at the columns' widths, so the rows that arrive don't move anything. */
function ColumnsSkeletonRow({
  widths,
  columns,
}: {
  readonly widths: { title: SkeletonBarWidth; meta: SkeletonBarWidth };
  readonly columns: readonly ListColumn[];
}) {
  const bars: Record<ListColumn["kind"], ReactNode> = {
    status: <SkeletonBar kind="trailing" />,
    code: <SkeletonBar kind="meta" width="2/3" />,
    main: (
      <span className="flex flex-col gap-2">
        <SkeletonBar kind="title" width={widths.title} />
        <SkeletonBar kind="meta" width={widths.meta} />
      </span>
    ),
    text: <SkeletonBar kind="meta" width="3/5" />,
    time: (
      <span className="flex justify-end">
        <SkeletonBar kind="meta" width="1/2" />
      </span>
    ),
  };
  return (
    <div className="hidden min-h-14 items-center gap-3 bg-surface px-4 @list-wide:flex">
      {columns.map((column) => (
        <div key={columnKey(column)} className={columnWidthClasses[column.kind]}>
          {bars[column.kind]}
        </div>
      ))}
    </div>
  );
}

/**
 * Seen, not announced: the status line already says "Still loading". Try again is `sm`, which a
 * Button draws at `lg` on a phone by itself.
 */
function StillLoading({ onRetry }: { readonly onRetry: (() => void) | undefined }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span aria-hidden="true" className="text-small text-fg-muted">
        Still loading
      </span>
      {onRetry === undefined ? null : (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * When loading ends while focus is in the skeleton, on Try again, the button goes and focus would
 * fall to `body` (23 A2). It goes to `focusNext` instead: the grid's Tab stop or the Empty state's
 * title. Focus somewhere else stays where it is.
 */
export function useFocusAfterLoading(loading: boolean, focusNext: () => void) {
  const focusInside = useRef(false);
  const wasLoading = useRef(loading);

  // After every render, so `focusNext` reaches the rows or the Empty state that just arrived.
  useLayoutEffect(() => {
    const ended = wasLoading.current && !loading;
    wasLoading.current = loading;
    if (!ended || !focusInside.current) {
      return;
    }
    focusInside.current = false;
    const focused = document.activeElement;
    if (focused === null || focused === document.body) {
      focusNext();
    }
  });

  return {
    onFocus: () => {
      focusInside.current = true;
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      // As in the Empty state's hook: a removed button may report no `relatedTarget`.
      const to = event.relatedTarget;
      if (to !== null) {
        focusInside.current = event.currentTarget.contains(to);
      }
    },
  };
}
