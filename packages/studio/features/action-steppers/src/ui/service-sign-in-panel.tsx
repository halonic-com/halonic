import { useEffect, useId, useState } from "react";
import type { ServiceSignInView } from "../stepper-view.ts";
import { serviceSignInWords } from "./stepper-words.ts";

/** Props for {@link ServiceSignInPanel}. */
export interface ServiceSignInPanelProps {
  readonly signIn: ServiceSignInView;
  /** The time now; the app's clock, tests pass their own. */
  readonly now?: () => number;
}

/**
 * A Paperclip sign-in step's code and countdown (`action-steppers.paperclip-sign-in-run`): the
 * code to compare on the approval page, the time left until it expires, and, once the key is kept,
 * whom it signs in as. The countdown ends at the time the run worked out, at most 10 minutes after
 * the start.
 */
export function ServiceSignInPanel({ signIn, now = Date.now }: ServiceSignInPanelProps) {
  const headingId = useId();
  const left = useTimeLeft(signIn.expiresAt, signIn.kept, now);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-body-strong text-fg">
        {serviceSignInWords.heading}
      </h3>
      <p className="text-body text-fg">
        {serviceSignInWords.code}:{" "}
        <span className="font-mono text-body-strong wrap-break-word">{signIn.code}</span>
      </p>
      {signIn.kept ? null : (
        <>
          <p className="text-body text-fg">{serviceSignInWords.compare}</p>
          <div className="text-small text-fg-muted">
            {left > 0 ? <p>{serviceSignInWords.timeLeft(left)}</p> : null}
            {/* In the page from the start and empty until the time is up, so a screen reader
                says that once and not every second of the countdown. */}
            <p role="status" aria-atomic="true">
              {left > 0 ? null : serviceSignInWords.timeUp}
            </p>
          </div>
        </>
      )}
      {signIn.account === null ? null : (
        <p className="text-body text-fg">{serviceSignInWords.signedInAs(signIn.account)}</p>
      )}
    </section>
  );
}

/** The milliseconds left until `expiresAt`, counted down each second while the key isn't kept. */
function useTimeLeft(expiresAt: Date, kept: boolean, now: () => number): number {
  const [at, setAt] = useState(now);
  useEffect(() => {
    if (kept) return;
    const timer = setInterval(() => setAt(now()), 1000);
    return () => clearInterval(timer);
  }, [kept, now]);
  return Math.max(0, expiresAt.getTime() - at);
}
