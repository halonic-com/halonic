import type { MessagingId } from "@halonicjs/ports";
import { ChevronRightIcon, EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import type { EngineWords } from "@halonicjs/studio-shell";
import { type RefObject, useEffect, useRef } from "react";
import { activityWords } from "../activity-words.ts";
import type { ChannelAgentLine } from "../channel-activity.ts";

/** What a channel's panel lists, and how its reads went. */
export interface ChannelList {
  /** The channel's title: "Launch". */
  readonly channel: string;
  readonly lines: readonly ChannelAgentLine[];
  /** The first read isn't back yet: the lines have names but no status. */
  readonly loading: boolean;
  /** The newest read failed. */
  readonly failure: unknown;
  readonly readNow: () => void;
}

/**
 * A channel's agents in its activity panel, one line each ("Liam · Working on HAL-18592", "Noah ·
 * Idle"), the lead first (`messenger.activity-channel`). Picking one opens that agent's view; a
 * chevron at each line's end says so. Until the first read is back, each line shows a bar where its
 * status goes; when that read fails, the Messenger's failed-read callout with **Try again**; when a
 * later read fails, the lines last read under "showing what it said last"
 * (`messenger.activity-channel-states`).
 */
export function ChannelAgents({
  list,
  words,
  onPick,
}: {
  readonly list: ChannelList;
  readonly words: EngineWords;
  readonly onPick: (agent: MessagingId) => void;
}) {
  if (list.loading && list.failure !== undefined) {
    return (
      <EmptyState
        tone="error"
        align="start"
        title={activityWords.cantReadIn(list.channel)}
        action={{ label: activityWords.tryAgain, onClick: list.readNow }}
      />
    );
  }
  return (
    <>
      {list.failure === undefined ? null : (
        <p className="text-small text-fg-muted">{words.showingLast}</p>
      )}
      <ul aria-busy={list.loading || undefined} className="-mx-2 flex flex-col">
        {list.lines.map((line) => (
          <li key={line.agent}>
            <AgentLine line={line} onPick={onPick} />
          </li>
        ))}
      </ul>
    </>
  );
}

function AgentLine({
  line,
  onPick,
}: {
  readonly line: ChannelAgentLine;
  readonly onPick: (agent: MessagingId) => void;
}) {
  return (
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
        {line.status === undefined ? null : <span className="text-fg-muted"> · {line.status}</span>}
      </span>
      {line.status === undefined ? (
        <span aria-hidden="true" data-status-loading className="shrink-0">
          <SkeletonBar kind="trailing" />
        </span>
      ) : null}
      <span className="ms-auto size-icon-sm shrink-0 text-fg-subtle *:size-full rtl:-scale-x-100">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

/**
 * In a channel, picking an agent takes the line it was on away, so focus goes to **‹ Channel**;
 * going back puts it on the first agent's line. Nothing moves as the panel opens.
 */
export function useChannelFocus(panel: RefObject<HTMLElement | null>, agentShown: boolean): void {
  const before = useRef(agentShown);
  useEffect(() => {
    if (before.current === agentShown) return;
    before.current = agentShown;
    const target = agentShown ? "[data-back-to-channel]" : "[data-agent-line]";
    panel.current?.querySelector<HTMLElement>(target)?.focus();
  }, [panel, agentShown]);
}

/**
 * "‹ Channel": from an agent's view back to the channel's agents, in the panel header's leading
 * slot, where a narrow window's **‹ Launch** goes (Noah's design check, HAL-20156).
 */
export function BackToChannel({ onBack }: { readonly onBack: () => void }) {
  return (
    <button
      type="button"
      data-back-to-channel
      aria-label={activityWords.backToChannel}
      onClick={onBack}
      className="focus-ring inline-flex min-h-6 items-center rounded-sm px-1 text-small text-fg-muted hover:text-fg"
    >
      <span aria-hidden="true">‹ </span>
      {activityWords.channel}
    </button>
  );
}
