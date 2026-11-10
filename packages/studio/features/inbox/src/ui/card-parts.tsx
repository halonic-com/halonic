import { Button, Callout, type CalloutHandle } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useState } from "react";
import { PlainValue } from "./plain-value.tsx";

/** The line above the bar when an answer wasn't recorded (mc 10.2). */
export const failedText = "Couldn't record your decision.";

/** The item after this one, for the decided card's **Next** (flow-inbox 5.3). */
export interface NextItem {
  readonly title: string;
  /** Items still waiting, this one not counted. */
  readonly left: number;
  readonly open: () => void;
}

interface CardHeaderProps {
  readonly titleId: string;
  readonly title: string;
  readonly heading: RefObject<HTMLHeadingElement | null>;
  /** "Waiting since 10:42 (1 min)", or `null` once decided: the card no longer waits. */
  readonly since: string | null;
  readonly onOpenRun: () => void;
}

/**
 * Renders the card again every minute while it's open, so its "Waiting since
 * 10:42 (1 min)" keeps counting.
 */
export function useEveryMinute(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
}

/**
 * A card's header: its title, which takes focus when it opens, since when it waits while it
 * does, and **Open run** (flow-inbox 5.3).
 */
export function CardHeader({ titleId, title, heading, since, onOpenRun }: CardHeaderProps) {
  return (
    <header className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          className="focus-ring text-title text-fg wrap-break-word"
        >
          {title}
        </h2>
        {since === null ? null : <p className="text-small text-fg-muted">{since}</p>}
      </div>
      <Button size="sm" onClick={onOpenRun}>
        Open run
      </Button>
    </header>
  );
}

interface DecidedBarProps {
  readonly text: string;
  /** The note you sent, under `text` as plain text, folded when long. */
  readonly note?: string;
  readonly next: NextItem | null;
  readonly callout: RefObject<CalloutHandle | null>;
}

/** The bar once decided: the decided Callout, which takes focus, then **Next** (flow-inbox 5.3). */
export function DecidedBar({ text, note, next, callout }: DecidedBarProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-border p-4">
      <Callout tone="info" announce="focus" ref={callout}>
        {text}
        {note === undefined ? null : (
          <>
            {" "}
            <PlainValue text={note} />
          </>
        )}
      </Callout>
      <div className="flex justify-end">
        {next === null ? (
          <p className="text-small text-fg-muted">Nothing else is waiting for you.</p>
        ) : (
          <Button variant="primary" onClick={next.open}>
            {`Next: ${next.title}`}
            <span aria-hidden="true">{` · ${next.left} left`}</span>
            <span className="sr-only">{`, ${next.left} left`}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

interface FailedLineProps {
  /** Shows "Couldn't record your decision." with **Try again** when set. */
  readonly onRetry: (() => void) | null;
}

/** The bar's always-mounted alert slot, above its buttons (a11y 8.3). */
export function FailedLine({ onRetry }: FailedLineProps) {
  return (
    <div role="alert" className="text-small text-fg">
      {onRetry === null ? null : (
        <span className="flex flex-wrap items-center gap-2">
          {failedText}
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </span>
      )}
    </div>
  );
}
