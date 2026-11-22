import { Button, useToastStore } from "@halonicjs/studio-kit";
import { copyDetailsWords, detailsOf, useCopyDetails } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState } from "react";
import { goneLine, removedToast, removeFailedLine, removeLabel } from "../plain/proposal-text.ts";
import {
  type ProposalDecisions,
  ProposalFailedError,
  type ProposalFailure,
} from "../proposal-decisions.ts";

/** What {@link GoneLine} shows. */
export interface GoneLineProps {
  readonly runId: string;
  readonly decisions: ProposalDecisions;
  /** After the proposal is removed, so the Inbox reads its items again and the row leaves. */
  readonly onRemoved: () => void;
}

/** A Remove that didn't go through: why, and the error, whose text goes only to **Copy details**. */
interface RemoveFailure {
  readonly failure: ProposalFailure;
  readonly error: unknown;
}

/**
 * A run whose changes are gone (HAL-11945 Q11, C681 31): "Run 01JD8Q's changes were deleted outside
 * Halonic, so they can't be shown or accepted." with **Remove from Inbox**, which takes it out of
 * Needs you at once, with no dialog: nothing is written, and it is done as not reviewed. A Remove
 * that fails says why by its kind, never in the host's words (C681 32). The line takes focus when
 * it shows, since it replaces the button just pressed.
 */
export function GoneLine({ runId, decisions, onRemoved }: GoneLineProps) {
  const toasts = useToastStore();
  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState<RemoveFailure | null>(null);
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => line.current?.focus(), []);

  function remove() {
    if (removing) return;
    setRemoving(true);
    setFailed(null);
    decisions
      .remove(runId)
      .then(() => {
        toasts?.show({ tone: "success", title: removedToast(runId) });
        onRemoved();
      })
      .catch((error: unknown) => setFailed(removeFailureOf(error)))
      .finally(() => setRemoving(false));
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p ref={line} tabIndex={-1} className="focus-ring min-w-0 flex-1 text-body text-fg">
          {goneLine(runId)}
        </p>
        {failed?.failure === "changes-back" ? null : (
          <Button size="sm" variant="secondary" busy={removing} onClick={remove}>
            {removeLabel}
          </Button>
        )}
      </div>
      {failed === null ? null : <RemoveFailedLine runId={runId} failed={failed} retry={remove} />}
    </div>
  );
}

/**
 * Why a Remove failed, with what can be done next: **Try again** while the engine isn't answering,
 * **Copy details** for a reason Halonic can't explain, and nothing when the changes are back, as
 * **Remove from Inbox** is gone then too.
 */
function RemoveFailedLine({
  runId,
  failed,
  retry,
}: {
  readonly runId: string;
  readonly failed: RemoveFailure;
  readonly retry: () => void;
}) {
  const copyDetails = useCopyDetails();
  const reason = removeFailedLine(failed.failure, runId);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p role="alert" className="text-small text-danger">
        {reason}
      </p>
      {failed.failure === "not-answering" ? (
        <Button size="sm" variant="ghost" onClick={retry}>
          Try again
        </Button>
      ) : null}
      {failed.failure === "unexplained" ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void copyDetails(detailsOf(reason, failed.error))}
        >
          {copyDetailsWords.label}
        </Button>
      ) : null}
    </div>
  );
}

/** A failure the app sorted keeps its kind; anything else is one Halonic can't explain. */
function removeFailureOf(error: unknown): RemoveFailure {
  return { failure: error instanceof ProposalFailedError ? error.failure : "unexplained", error };
}
