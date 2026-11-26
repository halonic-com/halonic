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
import { chatAgent } from "../chat-name.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { ActivityPanel, type PanelPlace } from "./activity-panel.tsx";
import {
  ActivityToggleContext,
  type ActivityWidth,
  useActivityOpen,
  useActivityWidth,
} from "./activity-toggle.tsx";
import { reportMotion } from "./load-states.tsx";
import { useActivity } from "./use-activity.ts";

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
 * back on the header button.
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
  const activity = useActivity(messenger, row, open);
  const name = chatAgent(row)?.name ?? row.conversation.title;
  const working = activity.view?.kind === "working";
  const said = useRunAnnouncement(name, activity.view);
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
  return (
    <ActivityToggleContext value={value}>
      <div ref={host} className="relative flex min-w-0 flex-1 gap-2">
        <p role="status" className="sr-only">
          <span key={said.count}>{said.text}</span>
        </p>
        <div className={open && place === "place" ? "hidden" : "contents"}>{children}</div>
        {open ? (
          <ActivityPanel
            row={row}
            activity={activity}
            now={messenger.now()}
            words={words}
            place={place}
            onClose={close}
          />
        ) : null}
      </div>
    </ActivityToggleContext>
  );
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
 * The chat with its activity panel (`messenger.activity-panel`), where one is offered: a direct
 * chat with an agent host serving the activity. A channel gets its panel later.
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
  if (messenger.activity === undefined || row === undefined || isChannel(row)) {
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
