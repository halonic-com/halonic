import type { EngineWords } from "@halonicjs/studio-shell";
import { type ReactNode, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { isChannel } from "../channel.ts";
import { chatAgent } from "../chat-name.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { ActivityPanel, useActivity } from "./activity-panel.tsx";
import { ActivityToggleContext, useActivityOpen, useWide } from "./activity-toggle.tsx";

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
