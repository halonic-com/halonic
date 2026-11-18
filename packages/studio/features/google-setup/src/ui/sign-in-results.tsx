import { Button, Callout, ExternalLink } from "@halonicjs/studio-kit";
import { failureLine } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef, useState } from "react";
import type { CheckAgainAnswer } from "../api.ts";
import { checkAgainText } from "./check-again.ts";
import { useNotAnswering } from "./not-answering.tsx";
import {
  allPassedText,
  canCheckAgain,
  resultText,
  type ServiceResultLine,
} from "./result-lines.ts";

/** Props for {@link SignInResults}. */
export interface SignInResultsProps {
  /** The account's address, for "Google is set up for …". */
  readonly email: string;
  /** How many services are ticked. "Google is set up" needs a passing result for each. */
  readonly ticked: number;
  /** The ticked services whose check ran after the last sign-in, in the order Studio shows them. */
  readonly lines: readonly ServiceResultLine[];
  /** **Check again**: the host checks each service and saves the results on the record. It rejects when it can't. */
  readonly onCheckAgain: () => Promise<CheckAgainAnswer>;
  readonly answering: boolean;
}

/**
 * What step 7 shows after a sign-in came back (design 3.5, items 3, 4 and 7): one line per service,
 * and a single sentence when every ticked service has a current result and it passed. A service
 * that hasn't been checked since the sign-in shows nothing, so it can't be counted as passed.
 * **Check again** is under the lines while one of them can change by itself (an API switched on).
 */
export function SignInResults(props: SignInResultsProps) {
  const { email, ticked, lines, onCheckAgain, answering } = props;
  const notAnswering = useNotAnswering();
  const reason = useId();
  const button = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // When the check made the button go away (everything passes now), focus moves to the results.
  useEffect(() => {
    if (hadFocus.current && button.current === null) {
      hadFocus.current = false;
      region.current?.focus();
    }
  });

  if (lines.length === 0) return null;

  async function checkAgain() {
    if (checking || !answering) return;
    hadFocus.current = document.activeElement === button.current;
    setChecking(true);
    setNote(null);
    try {
      setNote(checkAgainText(await onCheckAgain()));
    } catch (error) {
      setNote(failureLine("check again", error));
    } finally {
      setChecking(false);
    }
  }

  const allPassed = lines.length === ticked && lines.every((line) => resultText(line).passed);
  const checkable = lines.some(canCheckAgain);
  return (
    // Polite, so the new result is read after a check without stealing focus.
    <div ref={region} tabIndex={-1} aria-live="polite" className="flex flex-col gap-2 outline-none">
      {allPassed ? (
        <Callout tone="info">{allPassedText(email, lines)}</Callout>
      ) : (
        <ul className="flex flex-col gap-1 text-body">
          {lines.map((line) => {
            const text = resultText(line);
            return (
              <li key={line.service} className="flex flex-wrap items-center gap-x-2">
                <span aria-hidden="true">{text.passed ? "✓" : "✗"}</span>
                <span className="sr-only">{text.passed ? "Passed: " : "Failed: "}</span>
                <span>{text.text}</span>
                {text.enableUrl === undefined ? null : (
                  <>
                    <ExternalLink href={text.enableUrl}>Switch it on</ExternalLink>
                    <span>then check again.</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {checkable && !allPassed ? (
        <div>
          <Button
            ref={button}
            variant="secondary"
            busy={checking}
            unavailable={answering ? undefined : { reason }}
            onClick={() => void checkAgain()}
          >
            Check again
          </Button>
        </div>
      ) : null}
      {checkable && !answering ? (
        <p id={reason} className="text-small text-fg-muted">
          {notAnswering}
        </p>
      ) : null}
      {note === null ? null : <Callout tone="attention">{note}</Callout>}
    </div>
  );
}
