import { Button } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { goneLine, removeFailedLine } from "../plain/proposal-text.ts";
import type { ProposalDecisions } from "../proposal-decisions.ts";

/** What {@link GoneLine} shows. */
export interface GoneLineProps {
  readonly runId: string;
  readonly decisions: ProposalDecisions;
  /** After the proposal is removed, so the Inbox reads its items again and the row leaves. */
  readonly onRemoved: () => void;
}

/**
 * A proposal whose texts are gone (HAL-11945 Q11): "This proposal can't be opened any more." with
 * **Remove**, which takes it out of Needs you at once, with no dialog: nothing is written, and it
 * is done as not reviewed. A Remove that fails says why, and **Remove** stays to try again. The line takes focus
 * when it shows, since it replaces the button just pressed.
 */
export function GoneLine({ runId, decisions, onRemoved }: GoneLineProps) {
  const [removing, setRemoving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => line.current?.focus(), []);

  function remove() {
    if (removing) return;
    setRemoving(true);
    setFailure(null);
    decisions
      .remove(runId)
      .then(onRemoved)
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : String(error)))
      .finally(() => setRemoving(false));
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p ref={line} tabIndex={-1} className="focus-ring min-w-0 flex-1 text-body text-fg">
          {goneLine}
        </p>
        <Button size="sm" variant="secondary" busy={removing} onClick={remove}>
          Remove
        </Button>
      </div>
      {failure === null ? null : (
        <p role="alert" className="text-small text-danger">
          {removeFailedLine} {failure}
        </p>
      )}
    </div>
  );
}
