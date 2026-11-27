import { Dialog, IconTile, Spinner, useOpenSignIn, WarningIcon } from "@halonicjs/studio-kit";
import { type SignInChallenge, signInLimitMs } from "@halonicjs/studio-services";
import { type ReactNode, useEffect, useState } from "react";
import * as words from "../connections-words.ts";
import type { EndedResult } from "./sign-in-flow.ts";

/**
 * The time left on `challenge`, read again once a second while there is one, for a timer written
 * as text. Without a challenge it doesn't tick.
 */
export function useLeftMs(
  challenge: Pick<SignInChallenge, "expiresAt"> | undefined,
  now: () => number = Date.now,
): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (challenge === undefined) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  return challenge === undefined ? signInLimitMs : Date.parse(challenge.expiresAt) - now();
}

/** The words the approval page shows too, in a row. */
function Phrase({ phrase }: { readonly phrase: string }) {
  return (
    <div>
      <span className="sr-only">{words.WORDS_LABEL}</span>
      <p
        className="m-0 rounded-md border border-border bg-surface-subtle px-4 py-3 text-center text-heading font-semibold text-fg [word-spacing:18px]"
        data-phrase
      >
        {phrase}
      </p>
    </div>
  );
}

/** "9:42 left", and a bar that empties over the 10 minutes; Pair with a server shows it too. */
export function Countdown({ leftMs }: { readonly leftMs: number }) {
  const share = Math.max(0, Math.min(1, leftMs / signInLimitMs));
  return (
    <div className="flex flex-col gap-1">
      {/* High contrast drops fills: the track keeps an edge and the fill keeps CanvasText. */}
      <div
        aria-hidden="true"
        className="h-1 overflow-hidden rounded-full bg-surface-subtle forced-colors:border forced-colors:border-[CanvasText]"
      >
        <div
          className="h-full bg-accent forced-color-adjust-none forced-colors:bg-[CanvasText]"
          data-countdown-fill
          style={{ width: `${share * 100}%` }}
        />
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
  const openSignIn = useOpenSignIn();
  return (
    <Dialog
      size="md"
      title={title}
      closeLabel={`Close ${title}`}
      confirm={{ label: words.OPEN_APPROVAL, busyLabel: words.OPEN_APPROVAL }}
      onConfirm={() => void openSignIn(challenge.approvalUrl)}
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
    case "key-not-saved":
      return words.KEY_NOT_SAVED;
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
  return (
    <EndingStep
      title={title}
      ending={endingOf(result)}
      onClose={onClose}
      onStartAgain={onStartAgain}
    />
  );
}

/** Any ending: an icon tile, the heading and its text, and Close or Start again. */
export function EndingStep({
  title,
  ending,
  onClose,
  onStartAgain,
}: {
  readonly title: string;
  readonly ending: words.Ending;
  readonly onClose: () => void;
  readonly onStartAgain: () => void;
}) {
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
          <p className="m-0 text-fg-muted">{withCode(ending.text)}</p>
        </div>
      </div>
    </Dialog>
  );
}

/** `text` with each part between backticks in mono, as a command: "Run `halonic serve pair`". */
export function withCode(text: string): ReactNode {
  const parts = text.split("`");
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      // The parts never move, so the place is the key.
      <code key={index} className="font-mono">
        {part}
      </code>
    ) : (
      part
    ),
  );
}

/** `text` without its backticks, for a field's error or an announcement, where a command can't be mono. */
export function plainText(text: string): string {
  return text.replaceAll("`", "");
}
