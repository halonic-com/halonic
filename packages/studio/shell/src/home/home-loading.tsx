import {
  SKELETON_AFTER_MS,
  SkeletonBar,
  type SkeletonBarWidth,
  usePresentation,
} from "@halonicjs/studio-kit";
import { createContext, useContext, useEffect, useState } from "react";

/**
 * Tells Home that one more (`1`) or one fewer (`-1`) section shows skeleton rows, so the page says
 * "Loading Home" once for all of them (microcopy 3.3), not once per section.
 */
export const HomeLoadingReport = createContext<(change: 1 | -1) => void>(() => {});

/** The title and meta bars' widths, a little different in each row, as in the kit's List. */
const rows: readonly { title: SkeletonBarWidth; meta: SkeletonBarWidth }[] = [
  { title: "2/5", meta: "7/10" },
  { title: "1/2", meta: "3/5" },
  { title: "1/3", meta: "2/3" },
];

/** Props for {@link SectionSkeleton}. */
export interface SectionSkeletonProps {
  /**
   * What the section's content looks like once it loads: `rows`, a list, or `cards`, the
   * plugins' cards side by side (T16-F35). Default `rows`.
   */
  readonly shape?: "rows" | "cards";
}

/**
 * A section while its card loads (kit 19.3): nothing for the first 300ms, so a fast load doesn't
 * flash, then still rows in the rows' shape. Hidden from screen readers, which hear the page's one
 * "Loading Home" instead. On a phone it's two rows, flush with the screen's edges like the lists
 * they stand in for (PH 2.6). The Cards section shows two cards instead, side by side on desktop
 * and one under the other on a phone, each with its footer's line (T16-F35).
 */
export function SectionSkeleton({ shape = "rows" }: SectionSkeletonProps) {
  const phone = usePresentation() === "phone";
  const showing = useShowingAfter(SKELETON_AFTER_MS);
  const report = useContext(HomeLoadingReport);
  useEffect(() => {
    if (!showing) {
      return;
    }
    report(1);
    return () => report(-1);
  }, [showing, report]);

  if (!showing) {
    return null;
  }
  if (shape === "cards") {
    return <CardsSkeleton phone={phone} />;
  }
  return (
    <div
      aria-hidden="true"
      className={phone ? "overflow-hidden" : "overflow-hidden rounded-md border border-border"}
    >
      {(phone ? rows.slice(0, 2) : rows).map((widths, index) => (
        <div
          key={widths.title}
          className={`flex min-h-14 flex-col justify-center gap-2 bg-surface px-4 ${index === 0 ? "" : "border-t border-border"}`}
        >
          <SkeletonBar kind="title" width={widths.title} />
          <SkeletonBar kind="meta" width={widths.meta} />
        </div>
      ))}
    </div>
  );
}

/** Two still cards in the shape of a plugin's card: its title, its result and its footer. */
function CardsSkeleton({ phone }: { readonly phone: boolean }) {
  return (
    <div aria-hidden="true" className={phone ? "grid gap-2 px-4" : "grid grid-cols-2 gap-2"}>
      {cardWidths.map((widths) => (
        <div
          key={widths.title}
          className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4"
        >
          <SkeletonBar kind="title" width={widths.title} />
          <SkeletonBar kind="meta" width="full" />
          <SkeletonBar kind="meta" width={widths.meta} />
          <div className="mt-2 border-t border-border pt-2">
            <SkeletonBar kind="meta" width="1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The two skeleton cards' title and last result line, a little different, as in the rows. */
const cardWidths: readonly { title: SkeletonBarWidth; meta: SkeletonBarWidth }[] = [
  { title: "2/5", meta: "3/5" },
  { title: "1/2", meta: "2/3" },
];

/** Whether `ms` have passed since the component mounted. */
function useShowingAfter(ms: number): boolean {
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowing(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return showing;
}
