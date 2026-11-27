import type { InboxItem as AgentItem } from "@halonicjs/ports";
import { Callout } from "@halonicjs/studio-kit";
import type { EndedCardState } from "@halonicjs/studio-kit/settle";
import { EndedLine } from "./ended-line.tsx";

/**
 * The line over the buttons, with the `id` that says why they're off: the final state once the
 * item ended elsewhere, how this card answered it, or why its source can't take an answer.
 */
export function ReasonLine({
  id,
  item,
  ended,
  decided,
  down,
  onEndedRead,
}: {
  readonly id: string;
  readonly item: AgentItem;
  readonly ended: EndedCardState | undefined;
  readonly decided: string | null;
  readonly down: string | null;
  readonly onEndedRead: (() => void) | undefined;
}) {
  if (ended !== undefined) {
    return <EndedLine id={id} item={item} state={ended} onRead={onEndedRead} />;
  }
  if (decided !== null) {
    return (
      <Callout tone="info" announce="polite">
        <span id={id}>{decided}</span>
      </Callout>
    );
  }
  return down === null ? null : (
    <p id={id} className="text-small text-fg-muted">
      {down}
    </p>
  );
}
