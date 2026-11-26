import type { MessagingId } from "@halonicjs/ports";
import { type RefObject, useEffect, useRef } from "react";
import { activityWords } from "../activity-words.ts";
import type { ChannelAgentLine } from "../channel-activity.ts";

/**
 * A channel's agents in its activity panel, one line each ("Liam · Working on HAL-18592", "Noah ·
 * Idle"), the lead first (`messenger.activity-channel`). Picking one opens that agent's view.
 */
export function ChannelAgents({
  lines,
  onPick,
}: {
  readonly lines: readonly ChannelAgentLine[];
  readonly onPick: (agent: MessagingId) => void;
}) {
  return (
    <ul className="-mx-2 flex flex-col">
      {lines.map((line) => (
        <li key={line.agent}>
          <button
            type="button"
            data-agent-line
            onClick={() => onPick(line.agent)}
            className="focus-ring-inset flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-small hover:bg-surface-muted"
          >
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${line.working ? "bg-accent" : "bg-fg-muted"}`}
            />
            <span className="min-w-0 truncate">
              <bdi className="text-fg">{line.name}</bdi>
              <span className="text-fg-muted"> · {line.status}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * In a channel, picking an agent takes the line it was on away, so focus goes to **‹ Channel**;
 * going back puts it on the first agent's line. Nothing moves as the panel opens.
 */
export function useChannelFocus(body: RefObject<HTMLElement | null>, agentShown: boolean): void {
  const before = useRef(agentShown);
  useEffect(() => {
    if (before.current === agentShown) return;
    before.current = agentShown;
    const target = agentShown ? "[data-back-to-channel]" : "[data-agent-line]";
    body.current?.querySelector<HTMLElement>(target)?.focus();
  }, [body, agentShown]);
}

/** "‹ Channel": from an agent's view back to the channel's agents. */
export function BackToChannel({ onBack }: { readonly onBack: () => void }) {
  return (
    <button
      type="button"
      data-back-to-channel
      aria-label={activityWords.backToChannel}
      onClick={onBack}
      className="focus-ring -mt-2 inline-flex min-h-6 items-center self-start rounded-sm px-1 text-small text-fg-muted hover:text-fg"
    >
      <span aria-hidden="true">‹ </span>
      {activityWords.channel}
    </button>
  );
}
