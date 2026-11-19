import { KindedError } from "@halonicjs/std";
import { EmptyState } from "@halonicjs/studio-kit";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import type { StudioHost } from "../engine/engine-words.ts";
import { useStudioHost } from "../engine/studio-host-context.ts";
import { isCodeLoadFailure } from "../errors/code-load-failure.ts";
import { pageStandInTitle } from "../tabs/history-moves.ts";
import { ViewErrorBoundary } from "../view-error-boundary.tsx";

/** The words of a view whose code couldn't load because the computer can't be reached. */
export const unreachableWords = {
  title: "Couldn't load this page",
  /** The title in a Settings section, on the desktop dialog and on the phone. */
  settingsTitle: "Couldn't load these settings",
  /** The sentence the served Inbox also says when the computer doesn't answer. */
  reason: (doing: string) => `Halonic couldn't reach the computer to ${doing}.`,
  retry: "Try again",
} as const;

/**
 * Whether `error` means the computer can't be reached (`shell.page-unreachable`): a view's code
 * that failed to load in a browser. The desktop app has its code on the computer itself, so there
 * a failed load is a bug.
 */
export function isUnreachable(host: StudioHost, error: unknown): boolean {
  return host !== "desktop-app" && isCodeLoadFailure(error);
}

/**
 * `error` as the `unavailable` error the can't-reach state shows, when it means the computer can't
 * be reached; else `error` itself. For a state that words its own errors, such as a Home card's.
 */
export function asUnreachable(host: StudioHost, error: unknown, doing: string): unknown {
  return isUnreachable(host, error)
    ? new KindedError("unavailable", unreachableWords.reason(doing))
    : error;
}

/** The words and heading level of the state in a part of a page, such as a Settings section. */
export interface UnreachableTitle {
  /** Default "Couldn't load this page". */
  readonly title?: string;
  /** Default 2. One level below the heading of the part it stands in for. */
  readonly headingLevel?: 2 | 3 | 4;
}

/**
 * A page whose code couldn't load because the computer can't be reached: the error-tone Empty
 * state "Couldn't load this page", the reason naming the page and **Try again**. When it shows and
 * focus was lost, such as from Try again, which has just gone, focus moves to its title. Its title
 * stands in for the page's `h1`, so a page that fails as it opens takes focus there too.
 */
export function PageUnreachable({
  pageName,
  onRetry,
  title = unreachableWords.title,
  headingLevel,
}: UnreachableTitle & {
  readonly pageName: string;
  readonly onRetry: () => void;
}) {
  const titleRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) {
      titleRef.current?.focus();
    }
  }, []);
  return (
    <EmptyState
      tone="error"
      titleRef={(element) => {
        titleRef.current = element;
        element?.setAttribute(pageStandInTitle, "");
      }}
      title={title}
      description={unreachableWords.reason(`show the ${pageName}`)}
      action={{ label: unreachableWords.retry, onClick: onRetry }}
      {...(headingLevel === undefined ? {} : { headingLevel })}
    />
  );
}

/**
 * A `ViewErrorBoundary` for a part of a page, such as a Settings section: when its code can't load
 * because the computer can't be reached, it shows {@link PageUnreachable} for `name`, whose
 * **Try again** imports it again; any other failure shows nothing, as before.
 */
export function UnreachableViewBoundary({
  name,
  children,
  ...title
}: UnreachableTitle & {
  readonly name: string;
  readonly children: ReactNode;
}) {
  const host = useStudioHost();
  const [attempt, setAttempt] = useState(0);
  return (
    <ViewErrorBoundary
      // A new attempt starts a new boundary, which forgets the error and imports the view again.
      key={attempt}
      fallback={(error) =>
        isUnreachable(host, error) ? (
          <PageUnreachable
            {...title}
            pageName={name}
            onRetry={() => setAttempt((count) => count + 1)}
          />
        ) : null
      }
    >
      {children}
    </ViewErrorBoundary>
  );
}
