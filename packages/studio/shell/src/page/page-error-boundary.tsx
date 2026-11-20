import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useStudioHost } from "../engine/studio-host-context.ts";
import { focusPageHeading } from "../tabs/history-moves.ts";
import { ViewErrorBoundary } from "../view-error-boundary.tsx";
import { PageStopped } from "./page-stopped.tsx";
import { isUnreachable, PageUnreachable } from "./page-unreachable.tsx";

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
 * On the served Studio and the phone, a page whose code couldn't load shows "Couldn't load this
 * page" instead, since the computer can't be reached (`shell.page-unreachable`): its **Try again**
 * imports the code again in place, as Reload page does, without reloading the window.
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
  const host = useStudioHost();
  // `lazyView` forgets a failed import, so drawing the page again imports its code again.
  const reload = () => setAttempt((count) => count + 1);
  return (
    <div ref={areaRef} className="contents">
      <ViewErrorBoundary
        // A new attempt starts a new boundary, which forgets the error and draws the page again.
        key={attempt}
        fallback={(error) =>
          isUnreachable(host, error) ? (
            <PageUnreachable pageName={pageName} onRetry={reload} />
          ) : (
            <PageStopped pageName={pageName} error={error} onReload={reload} />
          )
        }
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
