import { SKELETON_AFTER_MS, SkeletonBar, type SkeletonBarWidth } from "@halonicjs/studio-kit";
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

/**
 * A section while its card loads (kit 19.3): nothing for the first 300ms, so a fast load doesn't
 * flash, then still rows in the rows' shape. Hidden from screen readers, which hear the page's one
 * "Loading Home" instead.
 */
export function SectionSkeleton() {
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
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-md border border-border">
      {rows.map((widths, index) => (
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

/** Whether `ms` have passed since the component mounted. */
function useShowingAfter(ms: number): boolean {
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowing(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return showing;
}
