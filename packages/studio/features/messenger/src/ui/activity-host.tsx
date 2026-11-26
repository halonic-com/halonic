import type { EngineWords } from "@halonicjs/studio-shell";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ActivityTask, ActivityView } from "../activity.ts";
import { activityWords } from "../activity-words.ts";
import { isChannel } from "../channel.ts";
import { chatAgent } from "../chat-name.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { ActivityPanel } from "./activity-panel.tsx";
import { ActivityToggleContext, useActivityOpen, useWide } from "./activity-toggle.tsx";
import { useActivity } from "./use-activity.ts";

/**
 * The open chat with its activity panel beside it (`messenger.activity-panel`): it gives the chat's
 * header button and working line the panel's toggle, and draws the panel after the chat while it
 * is open. Closing it puts focus back on the header button.
 */
export function ActivityHost({
  messenger,
  row,
  words,
  children,
}: {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  readonly words: EngineWords;
  /** The chat's pane. */
  readonly children: ReactNode;
}) {
  const [open, toggle] = useActivityOpen();
  const activity = useActivity(messenger, row, open);
  const name = chatAgent(row)?.name ?? row.conversation.title;
  const working = activity.view?.kind === "working";
  const said = useRunAnnouncement(name, activity.view);
  const value = useMemo(() => ({ open, working, name, toggle }), [open, working, name, toggle]);
  const host = useRef<HTMLDivElement>(null);
  const close = () => {
    // The panel is gone at once; focus goes back to the button that opens it.
    flushSync(toggle);
    host.current?.querySelector<HTMLElement>("button[aria-controls][aria-pressed]")?.focus();
  };
  return (
    <ActivityToggleContext value={value}>
      <div ref={host} className="flex min-w-0 flex-1 gap-2">
        <p role="status" className="sr-only">
          <span key={said.count}>{said.text}</span>
        </p>
        {children}
        {open ? (
          <ActivityPanel
            row={row}
            activity={activity}
            now={messenger.now()}
            words={words}
            onClose={close}
          />
        ) : null}
      </div>
    </ActivityToggleContext>
  );
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
 * chat, in a wide window, with an agent host serving the activity. A channel gets its panel later.
 */
export function WithActivity({
  messenger,
  row,
  words,
  offered,
  children,
}: {
  readonly messenger: Messenger;
  readonly row: ConversationRow | undefined;
  readonly words: EngineWords;
  readonly offered: boolean;
  readonly children: ReactNode;
}) {
  if (!offered || messenger.activity === undefined || row === undefined || isChannel(row)) {
    return children;
  }
  return (
    <WhenWide narrow={children}>
      <ActivityHost key={row.conversation.id} messenger={messenger} row={row} words={words}>
        {children}
      </ActivityHost>
    </WhenWide>
  );
}

/** `children` in a window at least 1200 px wide, else `narrow`. */
function WhenWide({
  narrow,
  children,
}: {
  readonly narrow: ReactNode;
  readonly children: ReactNode;
}) {
  return useWide() ? children : narrow;
}
