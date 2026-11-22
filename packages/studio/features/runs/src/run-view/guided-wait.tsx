import { Button, Callout } from "@halonicjs/studio-kit";
import { guidedRunWords } from "./guided-run.ts";

/** The props of {@link GuidedWait}. */
export interface GuidedWaitProps {
  /** Whether the run waits for the person now: an answer to a wait step, or an approval. */
  readonly needsYou: boolean;
  /** Opens the Inbox at what the run waits on, for **Open Inbox**. */
  readonly openInbox: () => void;
}

/**
 * A guided run's line once it waits for the person (first-run-flow 3.5): "Waiting for you. It's
 * in your Inbox." with the one primary button **Open Inbox**, in place of the usual banner. Studio
 * doesn't open the Inbox by itself, since a screen that moves while someone reads it is jarring.
 * The line's status region is on the card from the start, so a screen reader hears the sentence
 * when it comes; the button sits outside it.
 */
export function GuidedWait({ needsYou, openInbox }: GuidedWaitProps) {
  return (
    <div className={needsYou ? "flex flex-col items-start gap-2" : undefined}>
      <Callout tone="warning" announce="polite">
        {needsYou ? guidedRunWords.waitingInInbox : null}
      </Callout>
      {needsYou ? (
        <Button variant="primary" onClick={openInbox}>
          {guidedRunWords.openInbox}
        </Button>
      ) : null}
    </div>
  );
}
