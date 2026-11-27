import type { InboxItem as AgentItem } from "@halonicjs/ports";
import { StatusChip } from "@halonicjs/studio-kit";
import { type EndedCardState, finalState } from "@halonicjs/studio-kit/settle";
import { useEffect, useRef } from "react";
import { answerText } from "../agent/agent-item-text.ts";

/**
 * How the open card's item ended when it ended elsewhere (`inbox.final-state-open`): its state once
 * it was answered, cancelled or expired, unless this card sent the answer, whose own line says so.
 */
export function endedElsewhere(item: AgentItem, answeredHere: boolean): EndedCardState | undefined {
  if (answeredHere || item.state.kind === "open") return undefined;
  return item.state;
}

/**
 * The open card's bar once its item ended elsewhere (G1 on HAL-20218): the final state in the
 * kit's words, as its row and the Messenger say it, such as "Approved by Liam · 14:02" or
 * "Cancelled · 14:02". When the line says only "Answered", the answer under it says how: the
 * option picked, or the reply in quotes. Its `id` describes the form of a
 * card that asked several questions, which stays ticked. When the focus was on a button that went
 * with it, the line takes the focus, so it never falls back to the page, and `onRead` says the
 * screen reader already read it out.
 */
export function EndedLine({
  id,
  item,
  state,
  onRead,
}: {
  readonly id: string;
  readonly item: AgentItem;
  readonly state: EndedCardState;
  readonly onRead: (() => void) | undefined;
}) {
  const line = useRef<HTMLParagraphElement>(null);
  // The line takes the focus only as it appears, so it's the first render's `onRead` that hears it.
  const read = useRef(onRead);
  useEffect(() => {
    if (document.activeElement !== document.body) return;
    line.current?.focus({ preventScroll: true });
    read.current?.();
  }, []);
  const { line: text, tone } = finalState(state);
  const how = howAnswered(item, state, text);
  return (
    <div className="flex flex-col gap-2">
      <p ref={line} id={id} tabIndex={-1} className="text-small focus-ring">
        <StatusChip tone={tone}>{text}</StatusChip>
      </p>
      {how === undefined ? null : <p className="text-small text-fg-muted wrap-break-word">{how}</p>}
    </div>
  );
}

/**
 * How it was answered, when its final-state line doesn't already say so: the line reads the same
 * as a plain reply's would, "Answered by …", not "Approved" or "Declined". A form of questions
 * shows its own ticks instead.
 */
function howAnswered(item: AgentItem, state: EndedCardState, line: string): string | undefined {
  if (state.kind !== "answered" || item.state.kind !== "answered") return undefined;
  const { answer } = item.state;
  if (answer.kind === "answers") return undefined;
  const answered = finalState({ ...state, answer: { kind: "reply" } }).line;
  return line === answered ? answerText(item, answer) : undefined;
}
