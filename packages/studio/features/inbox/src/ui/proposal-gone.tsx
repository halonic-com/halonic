import { Button, type ButtonUnavailable, useToastStore } from "@halonicjs/studio-kit";
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
  /** Reads the proposal again; fails when the read does. */
  readonly readAgain: () => Promise<void>;
  /** Once the changes are there again and were read, so the page shows them in place of this line. */
  readonly onChangesBack: () => void;
  /** While the engine isn't answering: **Remove from Inbox** stays, but doesn't act, and points at the line why. */
  readonly unavailable?: ButtonUnavailable | undefined;
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
 *
 * When the host refuses because the changes are there again, the page reads the proposal again and
 * shows them (C711 4); only when that read fails does the refusal's line stay, with focus on it.
 */
export function GoneLine({
  runId,
  decisions,
  onRemoved,
  readAgain,
  onChangesBack,
  unavailable,
}: GoneLineProps) {
  const toasts = useToastStore();
  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState<RemoveFailure | null>(null);
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => line.current?.focus(), []);

  async function refused(error: unknown) {
    const failure = removeFailureOf(error);
    if (failure.failure === "changes-back" && (await readBack(readAgain))) {
      onChangesBack();
      return;
    }
    setFailed(failure);
  }

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
      .catch(refused)
      .finally(() => setRemoving(false));
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* 20 rem before the button wraps under the line, so the line is never squeezed (C711 5). */}
        <p ref={line} tabIndex={-1} className="focus-ring min-w-0 grow basis-80 text-body text-fg">
          {goneLine(runId)}
        </p>
        {failed?.failure === "changes-back" ? null : (
          <Button
            size="sm"
            variant="secondary"
            busy={removing}
            unavailable={unavailable}
            onClick={remove}
          >
            {removeLabel}
          </Button>
        )}
      </div>
      {failed === null ? null : <RemoveFailedLine runId={runId} failed={failed} />}
    </div>
  );
}

/**
 * Why a Remove failed. **Remove from Inbox** stays to try again while the engine isn't answering,
 * so there is no second button for it (C711 6); a reason Halonic can't explain has **Copy details**.
 * When the changes are there again, **Remove from Inbox** is gone, so the line takes focus.
 */
function RemoveFailedLine({
  runId,
  failed,
}: {
  readonly runId: string;
  readonly failed: RemoveFailure;
}) {
  const copyDetails = useCopyDetails();
  const reason = removeFailedLine(failed.failure, runId);
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (failed.failure === "changes-back") alert.current?.focus();
  }, [failed]);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p ref={alert} tabIndex={-1} role="alert" className="focus-ring text-small text-danger">
        {reason}
      </p>
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

/** Whether the proposal could be read again; a read that fails is logged, and the page says the refusal. */
async function readBack(readAgain: () => Promise<void>): Promise<boolean> {
  try {
    await readAgain();
    return true;
  } catch (error) {
    console.error("Couldn't read the run proposal again", error);
    return false;
  }
}

/** A failure the app sorted keeps its kind; anything else is one Halonic can't explain. */
function removeFailureOf(error: unknown): RemoveFailure {
  return { failure: error instanceof ProposalFailedError ? error.failure : "unexplained", error };
}
