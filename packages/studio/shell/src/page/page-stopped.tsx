import { EmptyState } from "@halonicjs/studio-kit";
import { useLayoutEffect, useRef } from "react";
import { copyDetailsWords, detailsOf } from "../errors/copy-details-words.ts";
import { pageStandInTitle } from "../tabs/history-moves.ts";
import { useCopyDetails } from "./copy-details.ts";

/** The words of a page that stopped working (microcopy 22 F14). */
export const pageStoppedWords = {
  title: "This page stopped working",
  reason: (pageName: string) =>
    `Halonic ran into a problem showing ${pageName}. Nothing in your workspace changed.`,
  reload: "Reload page",
} as const;

/** The words and heading level of the state in a part of a page, such as a Settings section. */
export interface PageStoppedTitle {
  /** Default "This page stopped working". */
  readonly title?: string;
  /** Default 2. One level below the heading of the part it stands in for. */
  readonly headingLevel?: 2 | 3 | 4;
}

/**
 * The error-tone Empty state of a page that stopped working: its title, the reason naming the
 * page, **Reload page** and the link **Copy details**. When it shows and focus was lost, focus
 * moves to its title, which stands in for the page's `h1`.
 */
export function PageStopped({
  pageName,
  error,
  onReload,
  title = pageStoppedWords.title,
  headingLevel,
}: PageStoppedTitle & {
  readonly pageName: string;
  readonly error: unknown;
  readonly onReload: () => void;
}) {
  const titleRef = useRef<HTMLElement | null>(null);
  const copyDetails = useCopyDetails();
  useFocusWhenLost(titleRef);
  return (
    <EmptyState
      tone="error"
      // Stands in for the page's `h1`, so a page that stops as it opens takes focus here.
      titleRef={(element) => {
        titleRef.current = element;
        element?.setAttribute(pageStandInTitle, "");
      }}
      title={title}
      description={pageStoppedWords.reason(pageName)}
      action={{ label: pageStoppedWords.reload, onClick: onReload }}
      link={{
        label: copyDetailsWords.label,
        onClick: () => void copyDetails(detailsOf(`${title}: ${pageName}`, error)),
      }}
      {...(headingLevel === undefined ? {} : { headingLevel })}
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
