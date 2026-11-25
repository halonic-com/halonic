import { BackIcon, Button, ForwardIcon, SparkIcon } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef } from "react";
import { itemReviewWords as words } from "./item-review-words.ts";
import { steppedPosition } from "./review-position.ts";

/** Which of the bar's decisions is running, so its button shows it is busy. */
export type ItemReviewBusy = "accept-all" | "reject-all";

/** Props for {@link ItemReviewBar}. */
export interface ItemReviewBarProps {
  /** How many of the assistant's changes in the item are still to decide. */
  readonly count: number;
  /** The change Previous and Next last landed on, from 0; "1 of 3" shows it from 1. */
  readonly position: number;
  /**
   * Called with the position Previous or Next goes to. The page scrolls that change into view and
   * moves the focus to it.
   */
  readonly onStep: (position: number) => void;
  readonly onAcceptAll: () => void;
  readonly onRejectAll: () => void;
  readonly busy?: ItemReviewBusy | undefined;
  /**
   * Set while the item's file changed outside Halonic since the assistant's changes were last seen:
   * Accept all and Reject all wait, and the bar offers Compare in their place.
   */
  readonly heldOutside?: { readonly onCompare: () => void } | undefined;
  /** In place of "Accept all" and "Reject all", such as "Accept file" and "Reject file" in a file's tab. */
  readonly labels?: { readonly acceptAll: string; readonly rejectAll: string } | undefined;
}

/**
 * The item bar under an item page's header (`shell.item-review-bar`, AI changes 1.2): "The
 * assistant changed 3 things here", where Previous and Next landed, and Accept all and Reject all.
 * Previous and Next wrap around, so neither ever waits; with one change there's nowhere to step,
 * so they and the count aren't shown. Nothing shows without changes to review.
 *
 * When a decision waits because the file changed outside Halonic, "Changed outside Halonic" is
 * said through a status region that is always there, and the focus moves to Compare, which the
 * line describes (a11y check RV2).
 *
 * @example
 * <ItemReviewBar count={3} position={0} onStep={focusChange} onAcceptAll={acceptAll} onRejectAll={rejectAll} />
 */
export function ItemReviewBar({
  count,
  position,
  onStep,
  onAcceptAll,
  onRejectAll,
  busy,
  heldOutside,
  labels = words,
}: ItemReviewBarProps) {
  const held = heldOutside !== undefined;
  const outsideId = useId();
  const compare = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (held) compare.current?.focus();
  }, [held]);
  if (count <= 0) return null;
  return (
    <section
      aria-label={words.barLabel}
      className="mx-6 my-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-surface-subtle px-3 py-2 text-small"
    >
      <span className="size-4 shrink-0 text-accent">
        <SparkIcon />
      </span>
      <span className="font-medium">{words.changedHere(count)}</span>
      {count > 1 && <Stepper count={count} position={position} onStep={onStep} />}
      <span className="ms-auto flex flex-wrap items-center gap-2">
        {/* Off the layout, so it takes no gap while empty; the line shown is for the eye. */}
        <span role="status" className="sr-only">
          {held && words.changedOutside}
        </span>
        {heldOutside === undefined ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              busy={busy === "accept-all"}
              onClick={onAcceptAll}
            >
              {labels.acceptAll}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              busy={busy === "reject-all"}
              onClick={onRejectAll}
            >
              {labels.rejectAll}
            </Button>
          </>
        ) : (
          <>
            <span id={outsideId} aria-hidden="true" className="text-warning">
              {words.changedOutside}
            </span>
            <Button
              ref={compare}
              variant="secondary"
              size="sm"
              aria-describedby={outsideId}
              onClick={heldOutside.onCompare}
            >
              {words.compare}
            </Button>
          </>
        )}
      </span>
    </section>
  );
}

/**
 * "1 of 3", then Previous and Next. The count is a polite live region whose spoken text is
 * "Change 1 of 3", so a screen reader says where a step landed, also when it wrapped around.
 */
function Stepper({
  count,
  position,
  onStep,
}: {
  readonly count: number;
  readonly position: number;
  readonly onStep: (position: number) => void;
}) {
  const at = position + 1;
  return (
    <>
      <span aria-live="polite" className="text-fg-muted">
        <span aria-hidden="true">{words.position(at, count)}</span>
        <span className="sr-only">{words.spokenPosition(at, count)}</span>
      </span>
      <span className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          icon={<BackIcon />}
          onClick={() => onStep(steppedPosition(position, count, "previous"))}
        >
          {words.previous}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<ForwardIcon />}
          onClick={() => onStep(steppedPosition(position, count, "next"))}
        >
          {words.next}
        </Button>
      </span>
    </>
  );
}
