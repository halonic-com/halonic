import { Button, PanelSheetDialog } from "@halonicjs/studio-kit";
import { type ReactNode, useId, useState } from "react";
import type { AssistantHost } from "../api.ts";
import { useEngineAnswering } from "../panel/send-gate.ts";
import { cardWords as words } from "./card-words.ts";

/** Props for {@link TouchActions}. */
export interface TouchActionsProps {
  readonly host: AssistantHost;
  /** The `id` of the card's tag and sentence, which each button reads after its label. */
  readonly nameId: string;
  /** See what changes' `id`, which the strip's count moves focus to. */
  readonly reviewId: string;
  /** Accept all's `id` on the card, which takes focus after an Undo. */
  readonly acceptId: string;
  readonly busy: "accept" | "reject" | undefined;
  readonly onDecide: (decision: "accept" | "reject") => void;
  /** The line above the buttons when the file changed outside Halonic: its `id` and its words. */
  readonly held: { readonly id: string; readonly text: string } | undefined;
  /** What the sheet shows above the diff: the sentence, the path and the why. */
  readonly about: ReactNode;
  readonly diff: ReactNode;
  /** The card's state line, which takes the focus once the sheet's own button decided the card. */
  readonly stateLine: () => HTMLElement | null;
}

/** Two buttons that share a row when both labels fit their half, else each on its own row. */
const half = "flex min-w-fit flex-1 basis-[calc(50%-var(--spacing))]";

/**
 * An open card's buttons on a phone (flow-assistant 11.4): **Accept all** on its own row, then
 * **See what changes** and **Reject all**, side by side only when they fit, so Accept all never
 * sits next to Reject all. See what changes opens the panel sheet "What changes" with the diff
 * and both decisions in its footer. While Halonic on the computer isn't answering, or the file
 * waits on Compare, the decisions wait, with the reason written on the card and in the sheet.
 */
export function TouchActions(props: TouchActionsProps) {
  const { busy, onDecide, held } = props;
  const answering = useEngineAnswering(props.host);
  const [seeing, setSeeing] = useState(false);
  const waitingId = useId();
  const reasonId = useId();
  const cardReason = answering ? held?.id : waitingId;
  const reason = answering ? held?.text : words.waitingForComputer;
  const decision = (
    choice: "accept" | "reject",
    size: "lg" | "touch",
    waits: string | undefined,
  ) => (
    <Button
      // Only the card's own Accept all, not the sheet's, which is gone after an Undo.
      {...(choice === "accept" && size === "lg" ? { id: props.acceptId } : {})}
      variant={choice === "accept" ? "primary" : "secondary"}
      size={size}
      block
      aria-describedby={props.nameId}
      busy={busy === choice}
      unavailable={waits === undefined ? undefined : { reason: waits }}
      onClick={() => onDecide(choice)}
    >
      {choice === "accept" ? words.acceptAll : words.rejectAll}
    </Button>
  );
  return (
    <div className="mt-1 flex flex-col gap-2">
      {decision("accept", "lg", cardReason)}
      <div className="flex flex-wrap gap-2">
        <div className={half}>
          <Button
            id={props.reviewId}
            variant="secondary"
            size="lg"
            block
            aria-describedby={props.nameId}
            onClick={() => setSeeing(true)}
          >
            {words.seeWhatChanges}
          </Button>
        </div>
        <div className={half}>{decision("reject", "lg", cardReason)}</div>
      </div>
      {answering ? null : (
        <p id={waitingId} className="text-small text-fg-muted">
          {words.waitingForComputer}
        </p>
      )}
      {seeing ? (
        <PanelSheetDialog
          title={words.whatChanges}
          onClose={() => setSeeing(false)}
          returnFocus={props.stateLine}
          footer={
            <>
              {reason === undefined ? null : (
                <p
                  id={reasonId}
                  className={`w-full text-small ${answering ? "text-warning" : "text-fg-muted"}`}
                >
                  {reason}
                </p>
              )}
              {decision("accept", "touch", reason === undefined ? undefined : reasonId)}
              {decision("reject", "touch", reason === undefined ? undefined : reasonId)}
            </>
          }
        >
          <div className="flex flex-col gap-1 text-body">
            {props.about}
            {props.diff}
          </div>
        </PanelSheetDialog>
      ) : null}
    </div>
  );
}
