import { Dialog, IconTile, Spinner, useOpenExternal, WarningIcon } from "@halonicjs/studio-kit";
import type { SignInChallenge } from "@halonicjs/studio-services";
import { useEffect, useState } from "react";
import * as words from "../connections-words.ts";
import type { EndedResult } from "./sign-in-flow.ts";

/** How long a sign-in waits for approval, for the countdown's bar. */
const signInMs = 10 * 60 * 1000;

/**
 * The time left on `challenge`, read again once a second while there is one, for a timer written
 * as text. Without a challenge it doesn't tick.
 */
export function useLeftMs(
  challenge: SignInChallenge | undefined,
  now: () => number = Date.now,
): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (challenge === undefined) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  return challenge === undefined ? signInMs : Date.parse(challenge.expiresAt) - now();
}

/** The words the approval page shows too, in a row. */
function Phrase({ phrase }: { readonly phrase: string }) {
  return (
    <div>
      <span className="sr-only">{words.WORDS_LABEL}</span>
      <p
        className="m-0 rounded-lg border border-border bg-surface-subtle px-4 py-3 text-center text-heading font-semibold text-fg [word-spacing:18px]"
        data-phrase
      >
        {phrase}
      </p>
    </div>
  );
}

/** "9:42 left", and a bar that empties over the 10 minutes. */
function Countdown({ leftMs }: { readonly leftMs: number }) {
  const share = Math.max(0, Math.min(1, leftMs / signInMs));
  return (
    <div className="flex flex-col gap-1">
      <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-surface-subtle">
        <div className="h-full bg-accent" style={{ width: `${share * 100}%` }} />
      </div>
      <p className="m-0 text-small text-fg-muted" role="timer">
        {words.timeLeft(leftMs)}
      </p>
    </div>
  );
}

/**
 * A sign-in waiting for the board: the words to compare, the time left, the key note, and the
 * approval page, which opens in the browser while the dialog stays open.
 */
export function WaitingStep({
  title,
  challenge,
  leftMs,
  onCancel,
}: {
  readonly title: string;
  readonly challenge: SignInChallenge;
  readonly leftMs: number;
  readonly onCancel: () => void;
}) {
  const openExternal = useOpenExternal();
  return (
    <Dialog
      size="md"
      title={title}
      closeLabel={`Close ${title}`}
      confirm={{ label: words.OPEN_APPROVAL, busyLabel: words.OPEN_APPROVAL }}
      onConfirm={() => void openExternal(challenge.approvalUrl)}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-fg">{words.WORDS_LEAD}</p>
        <Phrase phrase={challenge.phrase} />
        <p className="m-0 flex items-center gap-2 text-fg-muted">
          <span className="inline-grid size-4">
            <Spinner />
          </span>
          {words.WAITING}
        </p>
        <Countdown leftMs={leftMs} />
        <p className="m-0 text-small text-fg-muted">{words.KEY_NOTE}</p>
      </div>
    </Dialog>
  );
}

/** Why the sign-in ended, in a heading and a text. */
function endingOf(result: EndedResult): words.Ending {
  switch (result.outcome) {
    case "expired":
      return words.EXPIRED;
    case "cancelled":
      return words.CANCELLED;
    case "refused":
      return words.companyMismatch(result.company);
  }
}

/** A sign-in that ended without connecting: an icon tile, why, and Close or Start again. */
export function EndedStep({
  title,
  result,
  onClose,
  onStartAgain,
}: {
  readonly title: string;
  readonly result: EndedResult;
  readonly onClose: () => void;
  readonly onStartAgain: () => void;
}) {
  const ending = endingOf(result);
  return (
    <Dialog
      size="md"
      title={title}
      closeLabel={`Close ${title}`}
      confirm={{ label: words.START_AGAIN, busyLabel: words.START_AGAIN }}
      cancelLabel={words.CLOSE}
      onConfirm={onStartAgain}
      onCancel={onClose}
    >
      <div className="flex items-start gap-4" role="status">
        <IconTile>
          <WarningIcon />
        </IconTile>
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-section text-fg">{ending.heading}</h3>
          <p className="m-0 text-fg-muted">{ending.text}</p>
        </div>
      </div>
    </Dialog>
  );
}
