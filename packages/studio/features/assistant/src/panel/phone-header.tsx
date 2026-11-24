import { AgentOrb, Button, Menu, type MenuEntry, MoreIcon } from "@halonicjs/studio-kit";
import { type RefObject, useState } from "react";
import { buildChatWords } from "../chat/build-chat-words.ts";
import type { ChatView } from "../chat/build-chats.ts";
import { chatMenuWords as words } from "../chat/chat-menu-words.ts";
import { runningLine, turnsOf } from "../chat/turns.ts";
import { type ChatHeaderProps, DeleteChatDialog } from "./chat-header.tsx";

/** The Assistant's orb in the halo's two colours, as the shell's phone top bar draws it. */
const haloColors = ["var(--halo-blue)", "var(--halo-violet)"] as const;

/** The phone's status line: its words, and whether it's the running one, with its dot. */
interface PhoneStatus {
  readonly text: string;
  readonly running: boolean;
}

/**
 * The status line on a phone (flow-assistant 11.3): as on a computer (2.2), plus "Stopped · model
 * call limit" after the last answer reached the limit, an expected stop with **Continue** in the
 * chat, so `fg-muted` with no dot. Only the running line has the dot.
 */
function phoneStatus(view: ChatView | undefined, lookingAt: string | undefined): PhoneStatus {
  if (view?.answering === true) return { text: runningLine(view.tool), running: true };
  const lastEnd =
    view === undefined ? undefined : turnsOf(view.messages, view.ends, false).at(-1)?.end;
  let text = lookingAt === undefined ? "" : buildChatWords.lookingAt(lookingAt);
  if (view?.stoppedByYou === true) text = buildChatWords.stopped;
  if (lastEnd?.kind === "model-call-limit") text = buildChatWords.stoppedAtLimit;
  return { text, running: false };
}

/**
 * The phone top bar's middle (`assistant.chat.phone-screen`, flow-assistant 11.3): the 24px orb
 * in its halo ring, **Assistant**, and the status line under it, not live. The chat's title isn't
 * here: it's on Recent chats and in Rename. The panel's own heading, hidden, holds the name for
 * screen readers and takes the focus, so the visible one is hidden from them.
 */
export function PhoneHeading(props: {
  readonly title: string;
  readonly view: ChatView | undefined;
  readonly lookingAt: string | undefined;
  /** Inside the top bar, for finding the panel's heading to focus. */
  readonly anchor: RefObject<HTMLDivElement | null>;
}) {
  const status = phoneStatus(props.view, props.lookingAt);
  return (
    <div ref={props.anchor} className="flex min-w-0 flex-1 items-center gap-2">
      <span className="inline-grid shrink-0 place-items-center rounded-full bg-halo-line p-0.5">
        <AgentOrb agentId="assistant" colors={haloColors} size={24} />
      </span>
      <div className="flex min-w-0 flex-col">
        <span aria-hidden="true" className="truncate text-heading text-fg">
          {props.title}
        </span>
        <p
          className={`flex min-w-0 items-center gap-1.5 text-caption ${status.running ? "text-running" : "text-fg-muted"}`}
        >
          {status.running ? (
            <span className="size-1.5 shrink-0 rounded-full bg-running forced-color-adjust-none forced-colors:bg-[CanvasText]" />
          ) : null}
          <span className="truncate">{status.text}</span>
        </p>
      </div>
    </div>
  );
}

/** Moves focus to the panel's heading, "Assistant", from inside its top bar. */
export function focusPanelHeading(anchor: RefObject<HTMLElement | null>): void {
  anchor.current?.closest("header")?.querySelector<HTMLElement>("h2")?.focus();
}

/**
 * The phone's ⋮ (flow-assistant 11.3): **New chat** while the chat has messages, **Recent
 * chats**, and for a kept chat **Rename** and **Delete chat**, with 48px items. A phone's top bar
 * has no New chat or ✕ of its own: Back closes the panel.
 */
export function PhoneChatMenu(
  props: ChatHeaderProps & {
    readonly onRecentChats: () => void;
    readonly onRename: () => void;
    /** Where focus goes once the chat is deleted: the empty panel's New chat (flow 2.2). */
    readonly afterDelete: () => HTMLElement | null;
  },
) {
  const [deleting, setDeleting] = useState(false);
  const chat = props.view?.chat;
  const kept = chat !== undefined && !chat.draft ? chat : undefined;
  const recent: MenuEntry = {
    id: "recent",
    label: words.phone.recentChats,
    onSelect: props.onRecentChats,
  };
  const entries: MenuEntry[] =
    kept === undefined
      ? [recent]
      : [
          { id: "new", label: buildChatWords.newChat, onSelect: props.onNewChat },
          recent,
          { id: "rename", label: words.rename, onSelect: props.onRename },
          { id: "delete", label: words.phone.deleteChat, onSelect: () => setDeleting(true) },
        ];
  return (
    <>
      <Menu
        align="end"
        trigger={(trigger) => (
          <Button
            {...trigger}
            variant="ghost"
            size="sm"
            icon={<MoreIcon />}
            label={words.moreActions(kept?.title ?? props.title)}
          />
        )}
        entries={entries}
      />
      {deleting && kept !== undefined ? (
        <DeleteChatDialog
          chats={props.chats}
          chat={kept}
          onClose={() => setDeleting(false)}
          afterDelete={props.afterDelete}
        />
      ) : null}
    </>
  );
}
