import { EmptyState } from "@halonicjs/studio-kit";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { copyDetailsWords, detailsOf } from "../errors/copy-details-words.ts";
import { focusPageHeading } from "../tabs/history-moves.ts";
import { ViewErrorBoundary } from "../view-error-boundary.tsx";
import { useCopyDetails } from "./copy-details.ts";

/** The words of a page that stopped working (microcopy 22 F14). */
export const pageStoppedWords = {
  title: "This page stopped working",
  reason: (pageName: string) =>
    `Halonic ran into a problem showing ${pageName}. Nothing in your workspace changed.`,
  reload: "Reload page",
} as const;

/** Props for {@link PageErrorBoundary}. */
export interface PageErrorBoundaryProps {
  /**
   * Which page this is, such as the item's id or the list's place. When it changes, the boundary
   * starts fresh: a page that stopped working doesn't carry over to the next page shown in the
   * same tab. Not the page's name, since two items can share a title.
   */
  readonly pageKey: string;
  /** What the page shows: the item's title, such as "Support reply", or the list's, "Agents". */
  readonly pageName: string;
  readonly children: ReactNode;
}

/**
 * Holds one page, so a page that throws while it draws stops alone: the sidebar and the other tabs
 * keep working (microcopy 22 F14, state coverage SH3). In its place the page shows the error-tone
 * Empty state "This page stopped working", the reason naming the page, **Reload page** and the
 * link **Copy details**.
 *
 * **Reload page** draws the page again from the start; when it works, focus goes to this page's
 * own `h1`, never to a heading elsewhere in the window. The error's own message never shows: it
 * goes only into Copy details.
 *
 * @example
 * <PageErrorBoundary pageKey={item.id} pageName={item.title}>
 *   <WorkflowPage item={item} />
 * </PageErrorBoundary>
 */
export function PageErrorBoundary({ pageKey, ...page }: PageErrorBoundaryProps) {
  // A new page starts a new area, which forgets the error and the count of reloads.
  return <PageArea key={pageKey} {...page} />;
}

function PageArea({ pageName, children }: Omit<PageErrorBoundaryProps, "pageKey">) {
  const [attempt, setAttempt] = useState(0);
  const areaRef = useRef<HTMLDivElement>(null);
  const reload = () => setAttempt((count) => count + 1);
  return (
    <div ref={areaRef} className="contents">
      <ViewErrorBoundary
        // A new attempt starts a new boundary, which forgets the error and draws the page again.
        key={attempt}
        fallback={(error) => <PageStopped pageName={pageName} error={error} onReload={reload} />}
      >
        {children}
        {/* Commits only when the page drew, so a Reload page that fails again moves no focus. */}
        {attempt > 0 && <FocusPageHeadingOnMount area={areaRef} />}
      </ViewErrorBoundary>
    </div>
  );
}

/** Moves focus to the `h1` inside `area` when it mounts, after a Reload page that worked. */
function FocusPageHeadingOnMount({
  area,
}: {
  readonly area: { readonly current: HTMLElement | null };
}): null {
  useLayoutEffect(() => {
    if (area.current !== null) {
      focusPageHeading(area.current);
    }
  }, [area]);
  return null;
}

function PageStopped({
  pageName,
  error,
  onReload,
}: {
  readonly pageName: string;
  readonly error: unknown;
  readonly onReload: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const copyDetails = useCopyDetails();
  useFocusWhenLost(titleRef);
  return (
    <EmptyState
      tone="error"
      titleRef={titleRef}
      title={pageStoppedWords.title}
      description={pageStoppedWords.reason(pageName)}
      action={{ label: pageStoppedWords.reload, onClick: onReload }}
      link={{
        label: copyDetailsWords.label,
        onClick: () => void copyDetails(detailsOf(`${pageStoppedWords.title}: ${pageName}`, error)),
      }}
    />
  );
}

/**
 * Moves focus to `target` when it shows, if focus was lost: it was inside the page that stopped,
 * or on Reload page, which has just gone (a11y 1.4). Focus somewhere else, such as the sidebar,
 * stays where the user put it.
 */
function useFocusWhenLost(target: { readonly current: HTMLElement | null }): void {
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) {
      target.current?.focus();
    }
  }, [target]);
}
