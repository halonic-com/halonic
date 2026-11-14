import { Button, Callout, SkeletonBar } from "@halonicjs/studio-kit";
import { useEffect, useId, useState } from "react";
import type { ListedToolsReviewState } from "../listed-tools-review-model.ts";
import { listedToolsWords } from "../listed-tools-words.ts";
import { PlainList } from "./plain-list.tsx";

/** What the review shows instead of its rows and its button bar, or `null` when it shows them. */
export type ReviewFallback =
  | { readonly kind: "loading" }
  | { readonly kind: "load-failed"; readonly reason: string }
  | { readonly kind: "listing-refused"; readonly reason: string }
  | { readonly kind: "unreadable"; readonly toolName: string | undefined }
  | { readonly kind: "nothing-waiting" };

/**
 * Which fallback the screen is in. The bar of buttons belongs to the rows to review, so a screen
 * with none of them has no bar: nothing can be approved before it is seen.
 */
export function reviewFallback(state: ListedToolsReviewState): ReviewFallback | null {
  const { snapshot } = state;
  if (snapshot === undefined) {
    return state.phase === "failed"
      ? { kind: "load-failed", reason: state.loadError ?? "" }
      : { kind: "loading" };
  }
  if (snapshot.listingRefused !== null) {
    return { kind: "listing-refused", reason: snapshot.listingRefused };
  }
  if (snapshot.unreadable !== null) {
    return { kind: "unreadable", toolName: snapshot.unreadable.toolName };
  }
  return snapshot.toReview.length === 0 && snapshot.keepsChanging.length === 0
    ? { kind: "nothing-waiting" }
    : null;
}

/** How long the loading rows are on screen before the screen reader hears "Connecting…". */
const ANNOUNCE_AFTER_MS = 1000;

/** The kit's loading rows, and "Connecting…" read out once if the wait is not short. */
function LoadingRows() {
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAnnounce(true), ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <div aria-hidden="true">
        <PlainList className="flex flex-col gap-4 px-4 py-3">
          {[0, 1, 2].map((index) => (
            <li key={index} className="flex flex-col gap-2">
              <SkeletonBar kind="title" width="2/5" />
              <SkeletonBar kind="meta" width="7/10" />
            </li>
          ))}
        </PlainList>
      </div>
      <p role="status" className="sr-only">
        {announce ? listedToolsWords.connecting : ""}
      </p>
    </>
  );
}

/** Props for {@link ListedToolsFallbackBody}. */
export interface ListedToolsFallbackBodyProps {
  readonly fallback: ReviewFallback;
  /** The connector's name, as on its card. */
  readonly sourceName: string;
  readonly onTryAgain: () => Promise<void>;
  /** Removes the unreadable approval of `toolName`. */
  readonly onRemoveApproval: (toolName: string) => Promise<void>;
  /** Why removing an approval failed, shown under the screen's text. */
  readonly error?: string | undefined;
}

/** The unreadable approval: removing it is the way out, once the service says which tool it is. */
function UnreadableApproval({
  sourceName,
  toolName,
  onRemoveApproval,
}: {
  readonly sourceName: string;
  readonly toolName: string | undefined;
  readonly onRemoveApproval: (toolName: string) => Promise<void>;
}) {
  const reasonId = useId();
  if (toolName === undefined) {
    return (
      <Callout tone="danger">
        {listedToolsWords.unreadable(sourceName, toolName)}
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" unavailable={{ reason: reasonId }}>
            {listedToolsWords.removeApproval}
          </Button>
          <span id={reasonId} className="text-fg-muted">
            {listedToolsWords.unreadableUnavailable}
          </span>
        </span>
      </Callout>
    );
  }
  return (
    <Callout
      tone="danger"
      action={{
        label: listedToolsWords.removeApproval,
        onClick: () => onRemoveApproval(toolName),
      }}
    >
      {listedToolsWords.unreadable(sourceName, toolName)}
    </Callout>
  );
}

/**
 * What the review says when it has no rows to decide on: still loading, the list couldn't be
 * read or was refused whole, an approval can't be read, or nothing is waiting. Each is plain
 * text from the catalogue; the store's own error never shows.
 */
export function ListedToolsFallbackBody({
  fallback,
  sourceName,
  onTryAgain,
  onRemoveApproval,
  error,
}: ListedToolsFallbackBodyProps) {
  switch (fallback.kind) {
    case "loading":
      return <LoadingRows />;
    case "load-failed":
      return (
        <Callout tone="danger" action={{ label: listedToolsWords.tryAgain, onClick: onTryAgain }}>
          {listedToolsWords.loadFailed(fallback.reason)}
        </Callout>
      );
    case "listing-refused":
      return (
        <Callout tone="danger">
          {listedToolsWords.listingRefused(sourceName, fallback.reason)}
        </Callout>
      );
    case "unreadable":
      return (
        <>
          <UnreadableApproval
            sourceName={sourceName}
            toolName={fallback.toolName}
            onRemoveApproval={onRemoveApproval}
          />
          {error === undefined ? null : <Callout tone="danger">{error}</Callout>}
        </>
      );
    case "nothing-waiting":
      return (
        <>
          <p className="text-body text-fg">{listedToolsWords.nothingWaiting}</p>
          {error === undefined ? null : <Callout tone="danger">{error}</Callout>}
        </>
      );
    default:
      return fallback satisfies never;
  }
}
