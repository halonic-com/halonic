import { Button, Callout, useOpenExternal } from "@halonicjs/studio-kit";
import type { AgentConnection, SignInChallenge } from "@halonicjs/studio-services";
import { useEffect, useState } from "react";
import * as words from "../connections-words.ts";
import type { EndedResult } from "./sign-in-flow.ts";

/** Re-renders once a second while mounted, for a timer written as text. */
function useSecondTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, []);
}

/** The words the approval page shows too; faded once the sign-in has ended. */
function Phrase({ phrase, faded }: { readonly phrase: string; readonly faded: boolean }) {
  return (
    <p
      className={`m-0 rounded-lg border border-border px-4 py-3 text-center font-mono text-lg text-fg ${faded ? "opacity-30" : ""}`}
      data-phrase
    >
      {phrase}
    </p>
  );
}

/** "Time left to approve: 9:59", never below 0:00. */
function TimeLeft({ leftMs }: { readonly leftMs: number }) {
  return (
    <p className="m-0 text-small text-fg-muted" role="timer">
      {words.timeLeft(leftMs)}
    </p>
  );
}

/**
 * A sign-in waiting for the board: the words to compare, the time left and the approval page.
 * When the time runs out it shows the ending at 0:00 by itself, without waiting for the engine.
 */
export function WaitingStep({
  challenge,
  now,
  onCancel,
  onStartAgain,
}: {
  readonly challenge: SignInChallenge;
  readonly now: () => number;
  readonly onCancel: () => void;
  readonly onStartAgain: () => void;
}) {
  useSecondTick();
  const openExternal = useOpenExternal();
  const leftMs = Date.parse(challenge.expiresAt) - now();
  if (leftMs <= 0) {
    return (
      <EndedStep
        result={{ outcome: "expired" }}
        challenge={challenge}
        onStartAgain={onStartAgain}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-fg">{words.PHRASE_LINE}</p>
      <Phrase phrase={challenge.phrase} faded={false} />
      <TimeLeft leftMs={leftMs} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void openExternal(challenge.approvalUrl)}>
          {words.OPEN_APPROVAL}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {words.CANCEL}
        </Button>
      </div>
    </div>
  );
}

/** Why the sign-in ended, in a title and a line. */
function endedWords(result: EndedResult): { readonly title: string; readonly line: string } {
  switch (result.outcome) {
    case "expired":
      return { title: words.EXPIRED_TITLE, line: words.EXPIRED_LINE };
    case "cancelled":
      return { title: words.CANCELLED_TITLE, line: words.CANCELLED_LINE };
    case "refused":
      return words.refusals[result.reason];
  }
}

/** A sign-in that ended without connecting: why, its words faded, and Start again. */
export function EndedStep({
  result,
  challenge,
  onStartAgain,
}: {
  readonly result: EndedResult;
  readonly challenge: SignInChallenge;
  readonly onStartAgain: () => void;
}) {
  const ended = endedWords(result);
  return (
    <div className="flex flex-col gap-4">
      <Callout
        tone="attention"
        title={ended.title}
        announce="focus"
        action={{ label: words.START_AGAIN, onClick: onStartAgain }}
      >
        {ended.line}
      </Callout>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Phrase phrase={challenge.phrase} faded />
        {result.outcome === "expired" ? <TimeLeft leftMs={0} /> : null}
      </div>
    </div>
  );
}

/** The sign-in worked: which connection, and Done. */
export function ConnectedStep({
  connection,
  onDone,
}: {
  readonly connection: AgentConnection;
  readonly onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-fg" role="status">
        {words.connectedTo(connection.label)}
      </p>
      <div>
        <Button variant="primary" onClick={onDone}>
          {words.DONE}
        </Button>
      </div>
    </div>
  );
}
