/**
 * Which part of a row the bar stands in for. `title` is 10px high and `meta` 8px; `trailing` is
 * the 80px value or chip on the right; `heading` is a List heading's 48px bar. `icon` (20px) and
 * `avatar` (28px) are the leading block.
 */
export type SkeletonBarKind = "title" | "meta" | "trailing" | "heading" | "icon" | "avatar";

/**
 * The share of the text column a `title` or `meta` bar takes. A fixed set, never random, so
 * tests and screenshots are stable.
 */
export type SkeletonBarWidth = "1/3" | "2/5" | "1/2" | "3/5" | "2/3" | "7/10" | "full";

export interface SkeletonBarProps {
  readonly kind: SkeletonBarKind;
  /** Only for `title` and `meta`. Default `full`. */
  readonly width?: SkeletonBarWidth;
}

const kindClasses: Record<SkeletonBarKind, string> = {
  title: "h-2.5 rounded-xs",
  meta: "h-2 rounded-xs",
  trailing: "h-2.5 w-20 rounded-xs",
  heading: "h-2 w-12 rounded-xs",
  icon: "size-icon-md shrink-0 rounded-xs",
  avatar: "size-7 shrink-0 rounded-full",
};

const widthClasses: Record<SkeletonBarWidth, string> = {
  "1/3": "w-1/3",
  "2/5": "w-2/5",
  "1/2": "w-1/2",
  "3/5": "w-3/5",
  "2/3": "w-2/3",
  "7/10": "w-7/10",
  full: "w-full",
};

/**
 * A still grey bar in the shape of text that is still loading: a List's skeleton rows, a Side
 * panel's loading lines. No shimmer and no pulse. Hidden from screen readers; the list or panel
 * says it's loading. The transparent border is what forced colours paints once it drops the fill,
 * so the bars stay visible in high contrast (kit 23.5).
 *
 * @example
 * <SkeletonBar kind="title" width="2/5" />
 */
export function SkeletonBar({ kind, width = "full" }: SkeletonBarProps) {
  const sized = kind === "title" || kind === "meta" ? ` ${widthClasses[width]}` : "";
  return (
    <span
      aria-hidden="true"
      className={`block border border-transparent bg-surface-muted ${kindClasses[kind]}${sized}`}
    />
  );
}
