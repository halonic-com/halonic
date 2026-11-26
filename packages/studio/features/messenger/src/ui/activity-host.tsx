import type { MessagingId } from "@halonicjs/ports";
import { swap } from "@halonicjs/studio-kit";
import type { EngineWords } from "@halonicjs/studio-shell";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type { ActivityTask, ActivityView } from "../activity.ts";
import { activityWords } from "../activity-words.ts";
import { isChannel } from "../channel.ts";
import { agentRow, channelAgentLines } from "../channel-activity.ts";
import { chatAgent } from "../chat-name.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { ChannelAgents } from "./activity-channel.tsx";
import {
  ActivityBody,
  ActivityPanel,
  activityPanelId,
  type PanelPlace,
} from "./activity-panel.tsx";
import {
  ActivityToggleContext,
  type ActivityWidth,
  useActivityKey,
  useActivityOpen,
  useActivityWidth,
} from "./activity-toggle.tsx";
import { reportMotion } from "./load-states.tsx";
import { type ActivityRead, activityFor, useActivityReads } from "./use-activity.ts";

/** Where the panel goes in each window width (HAL-18558 section 3). */
const placeIn: Record<ActivityWidth, PanelPlace> = {
  wide: "beside",
  medium: "sheet",
  narrow: "place",
};

/**
 * The open chat with its activity panel (`messenger.activity-panel`, `messenger.activity-widths`):
 * it gives the chat's header button and working line the panel's toggle, and draws the panel
 * beside the chat on a wide window, as a sheet over its right side on a medium one, or instead of
 * it on a narrow one, where the panel and the chat slide in as places do (motion 2). The chat stays
 * mounted while the panel takes its place, so nothing typed is lost. Closing the panel puts focus
 * back on the header button. **Ctrl+I** opens and closes it as the button and the panel's own
 * **×** or **‹ Chief** do. In a channel the panel lists the channel's agents, and picking one shows
 * that agent's view (`messenger.activity-channel`).
 */
export function ActivityHost({
  messenger,
  row,
  words,
  width,
  children,
}: {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  readonly words: EngineWords;
  readonly width: ActivityWidth;
  /** The chat's pane. */
  readonly children: ReactNode;
}) {
  const [open, toggle] = useActivityOpen(width);
  const shown = useShownAgent(messenger, row, open);
  const name = chatAgent(row)?.name ?? row.conversation.title;
  const working = shown.working;
  const said = useRunAnnouncement(shown.name, shown.activity?.view);
  const host = useRef<HTMLDivElement>(null);
  const place = placeIn[width];
  const { go, opens } = usePlaceMotion(host, place, toggle);
  const value = useMemo(
    () => ({ open, working, name, toggle: opens }),
    [open, working, name, opens],
  );
  const close = () => {
    // The panel is gone; focus goes back to the button that opens it.
    go("back");
    host.current?.querySelector<HTMLElement>("button[aria-controls][aria-pressed]")?.focus();
  };
  useCloseKey(host, opens);
  return (
    <ActivityToggleContext value={value}>
      <div ref={host} className="relative flex min-w-0 flex-1">
        <p role="status" className="sr-only">
          <span key={said.count}>{said.text}</span>
        </p>
        <div className={open && place === "place" ? "hidden" : "contents"}>{children}</div>
        {open ? (
          <ActivityPanel
            name={shown.name}
            chat={name}
            shows={shown.activity === undefined ? "agents" : shown.activity.view?.kind}
            place={place}
            onClose={close}
            onBack={shown.back}
          >
            <ShownBody shown={shown} now={messenger.now()} words={words} />
          </ActivityPanel>
        ) : null}
      </div>
    </ActivityToggleContext>
  );
}

/**
 * **Ctrl+I**: closes through the panel's own **×** or **‹ Chief**, so it moves and puts focus back
 * as they do (HAL-18567 review); opens as the header button does.
 */
function useCloseKey(host: RefObject<HTMLDivElement | null>, opens: () => void): void {
  const press = useCallback(() => {
    const closes = host.current?.querySelector<HTMLElement>(`#${activityPanelId} [data-closes]`);
    if (closes) closes.click();
    else opens();
  }, [host, opens]);
  useActivityKey(press);
}

/** The panel's body: the channel's agents, or one agent's activity. */
function ShownBody({
  shown,
  now,
  words,
}: {
  readonly shown: ReturnType<typeof useShownAgent>;
  readonly now: Date;
  readonly words: EngineWords;
}) {
  if (shown.activity === undefined) {
    return <ChannelAgents lines={shown.lines} onPick={shown.pick} />;
  }
  return <ActivityBody name={shown.name} activity={shown.activity} now={now} words={words} />;
}

/**
 * Whose activity the panel shows: a chat's agent; in a channel, its agents' lines until the
 * person picks one, then that agent, with `back` to the lines. A channel reads every agent's runs
 * at once. Its header button's dot shows while any of its agents works.
 */
function useShownAgent(messenger: Messenger, row: ConversationRow, open: boolean) {
  const channel = isChannel(row);
  const reads = useActivityReads(messenger, channel ? undefined : row.conversation.agent, open);
  const [picked, setPicked] = useState<MessagingId | undefined>(undefined);
  const now = messenger.now();
  const pick = useCallback((agent: MessagingId) => setPicked(agent), []);
  const back = useCallback(() => setPicked(undefined), []);
  if (!channel) {
    const activity = activityFor(reads, row, now);
    const name = chatAgent(row)?.name ?? row.conversation.title;
    return {
      name,
      activity,
      working: activity.view?.kind === "working",
      lines: [],
      pick,
      back: undefined,
    };
  }
  const lines =
    reads.read === undefined ? [] : channelAgentLines(row, reads.read.runs, reads.read.pulls, now);
  const working = lines.some((line) => line.working);
  const agent = row.agents.find((each) => each.id === picked);
  if (agent === undefined) {
    const activity: ActivityRead | undefined = undefined;
    return { name: row.conversation.title, activity, working, lines, pick, back: undefined };
  }
  const activity = activityFor(reads, agentRow(row, agent.id), now);
  return { name: agent.name, activity, working, lines, pick, back };
}

/**
 * On a narrow window the panel is a place you go to, and the chat one you come back to: each
 * slides in as places do (motion 2). Elsewhere the panel just opens and closes.
 */
function usePlaceMotion(
  host: RefObject<HTMLDivElement | null>,
  place: PanelPlace,
  toggle: () => void,
) {
  const go = useCallback(
    (way: "in" | "back") => {
      const pane = host.current;
      if (place !== "place" || pane === null) return flushSync(toggle);
      swap(pane, () => flushSync(toggle), way).catch(reportMotion);
    },
    [host, place, toggle],
  );
  const opens = useCallback(() => (place === "place" ? go("in") : toggle()), [place, go, toggle]);
  return { go, opens };
}

/**
 * What the host's status region reads out: once when the agent's run starts ("Chief started:
 * ACME-7 Ship the site") and once when it ends ("Chief finished: …"), never on the first read or
 * on the minute-by-minute times.
 */
function useRunAnnouncement(name: string, view: ActivityView | undefined) {
  const [said, setSaid] = useState({ text: "", count: 0 });
  const before = useRef<ActivityView | undefined>(undefined);
  useEffect(() => {
    const last = before.current;
    before.current = view;
    if (last === undefined || view === undefined || last.kind === view.kind) return;
    if (view.kind === "working") {
      const text = activityWords.announceStarted(name, taskName(view.task));
      setSaid((was) => ({ text, count: was.count + 1 }));
    } else if (last.kind === "working" && view.kind === "ended") {
      const text = activityWords.announceFinished(name, taskName(view.task));
      setSaid((was) => ({ text, count: was.count + 1 }));
    }
  }, [name, view]);
  return said;
}

/** "ACME-7 Ship the site", or "This chat" for a run that answers it. */
function taskName(task: ActivityTask): string {
  if (task.onChat) return activityWords.thisChat;
  const parts = [task.identifier, task.title].filter((part) => part !== undefined);
  return parts.length === 0 ? activityWords.run(task.run) : parts.join(" ");
}

/**
 * The chat with its activity panel (`messenger.activity-panel`), where one is offered: a chat or a
 * channel, with an agent host serving the activity (`messenger.activity-channel`).
 */
export function WithActivity({
  messenger,
  row,
  words,
  children,
}: {
  readonly messenger: Messenger;
  readonly row: ConversationRow | undefined;
  readonly words: EngineWords;
  readonly children: ReactNode;
}) {
  const width = useActivityWidth();
  if (messenger.activity === undefined || row === undefined) {
    return children;
  }
  return (
    <ActivityHost
      key={row.conversation.id}
      messenger={messenger}
      row={row}
      words={words}
      width={width}
    >
      {children}
    </ActivityHost>
  );
}
