import { type ReactNode, useEffect, useRef, useState } from "react";
import { Callout, type CalloutAction } from "../callout/callout.tsx";

export interface AlertSlotProps {
  /** The failure of what you just did: "Couldn't delete Sorter. The file is open elsewhere." */
  readonly error?: string | undefined;
  /** Goes up by one each time you try again, so a second failure with the same words is read. */
  readonly attempt: number;
  /** While the attempt's request runs, the slot stays empty. */
  readonly waiting: boolean;
  /** The failure's one action: "Try again". */
  readonly retry?: CalloutAction | undefined;
  /**
   * What follows the failure's sentence, such as the command it says to run and its buttons. It
   * shows with the Callout, under it, but outside the alert, so only the sentence is read (C533-3).
   */
  readonly details?: ReactNode;
}

/**
 * The alert slot of the Dialog and, later, the text sheet (component specs 17.3): an
 * always-mounted `role="alert"` with no box of its own, so it takes no room while it's empty and
 * screen readers know it before the error arrives. Focus stays where it is (on the confirming
 * button), and the error is read through the slot, as a `danger` Callout with no role.
 *
 * Every failure is read once: on each attempt the slot empties, and fills again a frame after the
 * request ends. It then scrolls into view, since it's the last thing in a scrolling body.
 */
export function AlertSlot({ error, attempt, waiting, retry, details }: AlertSlotProps) {
  const slot = useRef<HTMLDivElement>(null);
  const [shownAttempt, setShownAttempt] = useState(attempt);
  const emptied = shownAttempt !== attempt;

  useEffect(() => {
    if (!emptied || waiting) {
      return;
    }
    const frame = requestAnimationFrame(() => setShownAttempt(attempt));
    return () => cancelAnimationFrame(frame);
  }, [emptied, waiting, attempt]);

  const message = emptied || error === "" ? undefined : error;

  useEffect(() => {
    if (message !== undefined) {
      slot.current?.scrollIntoView({ block: "nearest" });
    }
  }, [message, shownAttempt]);

  return (
    <div ref={slot}>
      <div role="alert">
        {message === undefined ? null : (
          <div className="pt-4">
            <Callout key={shownAttempt} tone="danger" {...(retry ? { action: retry } : {})}>
              {message}
            </Callout>
          </div>
        )}
      </div>
      {message === undefined || details === undefined ? null : (
        <div className="flex flex-col gap-4 pt-4">{details}</div>
      )}
    </div>
  );
}
