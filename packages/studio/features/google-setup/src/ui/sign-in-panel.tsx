import { pendingSignInLifetimeMs } from "@halonicjs/google-setup";
import { Button, Callout, Spinner, useOpenExternal } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { failureLine } from "./failure-line.ts";
import { useNotAnswering } from "./not-answering.tsx";

/** Props for {@link SignInPanel}. */
export interface SignInPanelProps {
  /** The host makes the sign-in and gives the address to open. It rejects with a readable reason. */
  readonly start: () => Promise<string>;
  /** Drops the pending sign-in on the host. */
  readonly cancel: () => Promise<void>;
  /** When the host last started a sign-in that hasn't ended, from the setup record. */
  readonly signInStartedAt: string | null;
  /** When the last sign-in finished, from the setup record. */
  readonly lastSignInAt: string | null;
  /** When the last sign-in came back for another account, from the setup record. */
  readonly wrongAccountAt: string | null;
  readonly answering: boolean;
  /** Opens step 6, for "check the client ID". */
  readonly onOpenClientStep: () => void;
  /** What shows under the waiting state: Google's own error pages, which never come back here. */
  readonly whileWaiting: ReactNode;
}

/**
 * Where the step is in the sign-in. `waiting` keeps the address the host gave, so **Open again**
 * opens the same sign-in: starting another would make the first tab's answer fail. The address is
 * never shown, only opened.
 */
type SignIn =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "waiting"; readonly address: string }
  | { readonly kind: "timed-out" }
  | { readonly kind: "dropped" }
  | { readonly kind: "failed"; readonly line: string; readonly retry: () => void };

/**
 * **Sign in with Google** and what the step says while it waits (design 3.5, items 1 and 2).
 *
 * The button is busy while the host makes the sign-in, then opens the browser. Waiting shows
 * "Waiting for Google…" with **Open again** and **Cancel**. After the sign-in's lifetime (10
 * minutes) with no answer, the step says the sign-in didn't come back and that Google may have
 * shown an error page, and the button is back. A record that says a sign-in started but this
 * window never began one means the last one didn't finish.
 */
export function SignInPanel(props: SignInPanelProps) {
  const { start, cancel, signInStartedAt, lastSignInAt, wrongAccountAt, answering } = props;
  const { onOpenClientStep, whileWaiting } = props;
  const openExternal = useOpenExternal();
  const notAnswering = useNotAnswering();
  const reason = useId();
  const [signIn, setSignIn] = useState<SignIn>({ kind: "idle" });
  // Once this window has started or cancelled a sign-in, an older "started" in the record is stale.
  const [acknowledged, setAcknowledged] = useState(false);
  // Cancel failing leaves the host holding the sign-in, so the panel keeps waiting and says why.
  const [cancelProblem, setCancelProblem] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const focusButton = useRef(false);
  // The record's "started" has been seen since waiting began: only then does its going away mean dropped.
  const seenStarted = useRef(false);
  const lastSignInWhenStarted = useRef(lastSignInAt);

  function begin() {
    if (signIn.kind === "starting") return;
    setAcknowledged(true);
    setCancelProblem(null);
    setSignIn({ kind: "starting" });
    lastSignInWhenStarted.current = lastSignInAt;
    seenStarted.current = signInStartedAt !== null;
    // The browser has to open its tab inside the click, so the address is handed over as a promise.
    const address = new Promise<string>((resolve) => resolve(start()));
    address.then(
      (url) => setSignIn({ kind: "waiting", address: url }),
      () => {},
    );
    openExternal(address).catch((error: unknown) => {
      setSignIn({
        kind: "failed",
        line: failureLine("start the sign-in", error),
        retry: begin,
      });
    });
  }

  async function cancelWaiting() {
    setCancelProblem(null);
    try {
      await cancel();
    } catch (error) {
      setCancelProblem(failureLine("cancel the sign-in", error));
      return;
    }
    focusButton.current = true;
    setSignIn({ kind: "idle" });
  }

  // The sign-in lifetime ends the wait: the host drops its own pending sign-in at the same time.
  useEffect(() => {
    if (signIn.kind !== "waiting") return;
    const timer = setTimeout(() => setSignIn({ kind: "timed-out" }), pendingSignInLifetimeMs);
    return () => clearTimeout(timer);
  }, [signIn.kind]);

  // The record tells how the wait ended: signed in, or dropped by the host.
  useEffect(() => {
    if (signIn.kind !== "waiting") return;
    if (signInStartedAt !== null) seenStarted.current = true;
    if (lastSignIn(lastSignInAt) !== lastSignIn(lastSignInWhenStarted.current)) {
      setSignIn({ kind: "idle" });
    } else if (signInStartedAt === null && seenStarted.current) {
      // A sign-in for another account ended too, but its note says so: not "didn't finish".
      setSignIn(wrongAccountAt === null ? { kind: "dropped" } : { kind: "idle" });
    }
  }, [signIn.kind, signInStartedAt, lastSignInAt, wrongAccountAt]);

  // Cancel hands focus to the button that comes back in its place.
  useEffect(() => {
    if (signIn.kind === "idle" && focusButton.current) {
      focusButton.current = false;
      button.current?.focus();
    }
  });

  const unfinished = signIn.kind === "idle" && !acknowledged && signInStartedAt !== null;
  if (signIn.kind === "waiting") {
    return (
      <Waiting
        problem={cancelProblem}
        below={whileWaiting}
        onOpenAgain={() => void openExternal(signIn.address)}
        onCancel={() => void cancelWaiting()}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {signIn.kind === "timed-out" ? (
        <Callout tone="attention">
          <span className="flex flex-col items-start gap-1">
            The sign-in didn't come back, or Google showed an error page instead. If it did, check
            the client ID in step 6. Then sign in again.
            <Button variant="ghost" size="sm" onClick={onOpenClientStep}>
              Open step 6
            </Button>
          </span>
        </Callout>
      ) : null}
      {signIn.kind === "dropped" || unfinished ? (
        <Callout tone="info">The last sign-in didn't finish. Sign in again.</Callout>
      ) : null}
      {signIn.kind === "failed" ? (
        <>
          <Callout tone="danger" action={{ label: "Try again", onClick: signIn.retry }}>
            {signIn.line}
          </Callout>
          <p role="alert" className="sr-only">
            {signIn.line}
          </p>
        </>
      ) : null}
      <div>
        <Button
          ref={button}
          variant="primary"
          busy={signIn.kind === "starting"}
          unavailable={answering ? undefined : { reason }}
          onClick={begin}
        >
          {wrongAccountAt === null ? "Sign in with Google" : "Sign in again"}
          <span aria-hidden="true"> ↗</span>
          <span className="sr-only"> (opens in your browser)</span>
        </Button>
      </div>
      {answering ? null : (
        <p id={reason} className="text-small text-fg-muted">
          {notAnswering}
        </p>
      )}
    </div>
  );
}

/** The time a sign-in finished, as a comparable value: `null` for never. */
function lastSignIn(at: string | null): string {
  return at ?? "";
}

function Waiting(props: {
  readonly problem: string | null;
  readonly below: ReactNode;
  readonly onOpenAgain: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="size-4 text-fg-muted">
          <Spinner />
        </span>
        {/* A status is read once when it appears, and not again while it waits. */}
        <p role="status" className="text-body">
          Waiting for Google… Finish in your browser.
        </p>
        <Button variant="secondary" onClick={props.onOpenAgain}>
          Open again<span aria-hidden="true"> ↗</span>
          <span className="sr-only"> (opens in your browser)</span>
        </Button>
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
      {props.problem === null ? null : (
        <>
          <Callout tone="danger">{props.problem}</Callout>
          <p role="alert" className="sr-only">
            {props.problem}
          </p>
        </>
      )}
      {props.below}
    </div>
  );
}
