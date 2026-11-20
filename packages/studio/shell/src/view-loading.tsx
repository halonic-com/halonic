import {
  Button,
  SKELETON_AFTER_MS,
  SkeletonBar,
  type SkeletonBarWidth,
  STILL_LOADING_AFTER_MS,
  usePresentation,
} from "@halonicjs/studio-kit";
import { type ReactNode, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLazyView } from "./lazy-view.ts";
import type { ViewRef } from "./view.ts";

/** The words of a view that is still loading (microcopy 1.1, Loading). */
export const viewLoadingWords = {
  loading: (name: string) => `Loading ${name}`,
  slow: "Still loading",
  retry: "Try again",
} as const;

/** Props for {@link LoadedView}. */
export interface LoadedViewProps<Props extends object> {
  /** The view, imported the first time it shows. */
  readonly view: ViewRef;
  /** What the status line names while it loads: "Loading Agents". Without it, it says nothing until "Still loading". */
  readonly name?: string | undefined;
  /** What the view gets. */
  readonly props: Props;
  /** Called once the view first draws, after its code loaded: never while it loads or when it throws. */
  readonly onDrawn?: (() => void) | undefined;
}

/**
 * A feature's view, imported the first time it shows, with the Loading state while it loads
 * (`shell.view-loading-state`). Put a `ViewErrorBoundary` or a `PageErrorBoundary` round it for a view
 * that fails to load.
 *
 * @example
 * <LoadedView view={place} name="Agents" props={{ context }} />
 */
export function LoadedView<Props extends object>({
  view,
  name,
  props,
  onDrawn,
}: LoadedViewProps<Props>) {
  const { View, retry } = useLazyView<Props>(view);
  // `lazy` widens the props with `ref`, which a view's props never have.
  const Loaded = View as unknown as (props: Props) => ReactNode;
  return (
    <Suspense fallback={<ViewLoading name={name} onRetry={retry} />}>
      <Loaded {...props} />
      {/* In the same Suspense as the view, so it commits only once the view drew. */}
      {onDrawn === undefined ? null : <OnDrawn onDrawn={onDrawn} />}
    </Suspense>
  );
}

function OnDrawn({ onDrawn }: { readonly onDrawn: () => void }): null {
  // The caller's function is usually a new one each render; only the first draw counts.
  const latest = useRef(onDrawn);
  latest.current = onDrawn;
  useLayoutEffect(() => latest.current(), []);
  return null;
}

/** The title and meta bars' widths, a little different in each row, as in the kit's List. */
const rows: readonly { title: SkeletonBarWidth; meta: SkeletonBarWidth }[] = [
  { title: "2/5", meta: "7/10" },
  { title: "1/2", meta: "3/5" },
  { title: "1/3", meta: "2/3" },
];

type Wait = "early" | "showing" | "slow";

/**
 * A view while its code loads (microcopy 1.1, kit 19.3): nothing for the first 300ms, so a fast
 * load doesn't flash, then still rows hidden from screen readers, which hear "Loading _name_".
 * After 10 seconds "Still loading" and **Try again** show under the rows. **Try again** keeps the
 * rows and starts the 10 seconds over.
 */
export function ViewLoading({
  name,
  onRetry,
}: {
  readonly name?: string | undefined;
  readonly onRetry: () => void;
}) {
  const phone = usePresentation() === "phone";
  const [attempt, setAttempt] = useState(0);
  const [wait, setWait] = useState<Wait>("early");
  const areaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // After Try again the rows stay; only "Still loading" waits again.
    const show =
      attempt === 0 ? setTimeout(() => setWait("showing"), SKELETON_AFTER_MS) : undefined;
    const slow = setTimeout(() => setWait("slow"), STILL_LOADING_AFTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(slow);
    };
  }, [attempt]);
  const retry = () => {
    // Try again goes away, so focus goes to the area rather than falling to the page's body.
    areaRef.current?.focus();
    setWait("showing");
    setAttempt((count) => count + 1);
    onRetry();
  };
  const loading = name === undefined ? "" : viewLoadingWords.loading(name);
  const status = { early: "", showing: loading, slow: viewLoadingWords.slow }[wait];

  return (
    <div ref={areaRef} tabIndex={-1} className="outline-none">
      {/* There from the start, so screen readers announce the text when it arrives. */}
      <span role="status" className="sr-only">
        {status}
      </span>
      <div aria-busy="true">
        {wait === "early" ? null : (
          <div
            aria-hidden="true"
            className={
              phone ? "overflow-hidden" : "overflow-hidden rounded-md border border-border"
            }
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
        )}
        {wait === "slow" ? (
          // Seen, not announced: the status line already says "Still loading".
          <div className="flex items-center gap-3 p-4">
            <span aria-hidden="true" className="text-small text-fg-muted">
              {viewLoadingWords.slow}
            </span>
            <Button variant="secondary" size="sm" onClick={retry}>
              {viewLoadingWords.retry}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
