import {
  Button,
  ChevronDownIcon,
  CloseIcon,
  Dialog,
  Menu,
  type MenuEntry,
  MoreIcon,
  OpenAsTabIcon,
  PlusIcon,
  SparkIcon,
  useFormatLocale,
} from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { AssistantHost, ChatAgent, ChatSummary } from "../api.ts";
import { buildChatWords } from "../chat/build-chat-words.ts";
import type { Announce, BuildChats, ChatView } from "../chat/build-chats.ts";
import { chatTime, chatMenuWords as words } from "../chat/chat-menu-words.ts";
import { ChatAgentOrb } from "./agent-chat.tsx";

/** The parts of the header that act on the chat shown. */
export interface ChatHeaderProps {
  readonly host: AssistantHost;
  readonly chats: BuildChats;
  /** The chat shown, if any: without one the header is "Assistant" and ✕ only (H3). */
  readonly view: ChatView | undefined;
  /** The panel's name, the heading while there is no kept chat. */
  readonly title: string;
  readonly box: RefObject<HTMLTextAreaElement | null>;
  readonly onNewChat: () => void;
  /** The workspace's agents, for the colours of an agent chat's orb in the recent chats. */
  readonly agents: readonly ChatAgent[];
  /** Switches to the tab of a chat open as one, picked in the menu: one chat in one place. */
  readonly onOpenTab?: ((chatId: string) => void) | undefined;
  /** The chats the menu lists; every kept chat by default, only an item's on its page (2.4). */
  readonly only?: ((chat: ChatSummary) => boolean) | undefined;
  /** Shows a chat picked in the menu; by default the panel shows it, with focus in the box. */
  readonly onPick?: ((chatId: string) => void) | undefined;
  /** Says what happened that focus doesn't show, such as a deleted chat. */
  readonly announce: Announce;
}

/**
 * The title as the chat menu's button, or as the rename field while renaming (flow-assistant 5.5,
 * 5.6). A draft has no menu of its own yet, so its button still opens the recent chats.
 */
export function ChatHeading(
  props: ChatHeaderProps & { readonly renaming: boolean; readonly onRenamed: () => void },
) {
  const { chats, view, title, renaming } = props;
  const kept = useRecentChats(props.host);
  const locale = useFormatLocale();
  const recent = props.only === undefined ? kept : kept.filter(props.only);
  if (view === undefined) return title;
  const heading = view.chat.draft ? title : view.chat.title;
  if (renaming) {
    const done = () => {
      props.onRenamed();
      props.box.current?.focus();
    };
    return <RenameField chats={chats} chatId={view.chat.id} title={heading} onDone={done} />;
  }
  const pick = (chatId: string) => {
    if (props.onPick !== undefined) return props.onPick(chatId);
    if (chats.inTab(chatId) && props.onOpenTab !== undefined) return props.onOpenTab(chatId);
    void chats.pick(chatId).then(() => props.box.current?.focus());
  };
  const now = new Date();
  const rows: MenuEntry[] = recent.map((chat) => {
    const time = chatTime(chat.lastUsedAt, now, locale);
    return {
      id: chat.id,
      label: chat.title,
      icon:
        chat.kind === "build" ? (
          <SparkIcon />
        ) : (
          <ChatAgentOrb kind={chat.kind} agents={props.agents} size={16} />
        ),
      time,
      running: chat.answering ? words.answering : undefined,
      count:
        !chat.answering && chat.itemsToReview > 0 ? words.toReview(chat.itemsToReview) : undefined,
      name: words.rowName(chat.title, time, chat.answering, chat.itemsToReview),
      checked: chat.id === view.chat.id,
      onSelect: () => pick(chat.id),
    };
  });
  return (
    <Menu
      trigger={(trigger) => (
        <Button {...trigger} variant="ghost" size="sm" name={heading}>
          <span className="truncate">{heading}</span>
          <span className="ml-0.5 inline-flex size-3.5 text-fg-subtle">
            <ChevronDownIcon />
          </span>
        </Button>
      )}
      entries={[
        { id: "new", label: buildChatWords.newChat, icon: <PlusIcon />, onSelect: props.onNewChat },
        "divider",
        ...rows,
      ]}
      footer={words.footer}
    />
  );
}

/** The desktop header's **New chat**, Open as tab (flow-assistant 2.3), ⋮ and ✕. */
export function DesktopActions(
  props: ChatHeaderProps & {
    /** Moves the chat to a tab; none while there's no chat, or no tabs to open. */
    readonly onOpenAsTab: (() => void) | undefined;
    readonly onRename: () => void;
    readonly afterDelete: () => HTMLElement | null;
    readonly onClose: () => void;
  },
) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<PlusIcon />}
        label={buildChatWords.newChat}
        onClick={props.onNewChat}
      />
      {props.onOpenAsTab === undefined ? null : (
        <Button
          variant="ghost"
          size="sm"
          icon={<OpenAsTabIcon />}
          label={buildChatWords.openAsTab}
          onClick={props.onOpenAsTab}
        />
      )}
      <ChatMoreActions {...props} />
      <Button
        variant="ghost"
        size="sm"
        icon={<CloseIcon />}
        label={buildChatWords.close}
        onClick={props.onClose}
      />
    </>
  );
}

/**
 * The header's ⋮ (Rename, Delete chat…) and the Delete dialog, for a kept chat only. Delete chat
 * is a danger item, below a divider (component specs 14). A chat tab's title is its rename field,
 * so its ⋮ has no Rename.
 */
export function ChatMoreActions(
  props: Pick<ChatHeaderProps, "chats" | "view" | "announce"> & {
    readonly onRename?: (() => void) | undefined;
    /** Where focus goes once the chat is deleted: the empty panel's New chat (flow 2.2). */
    readonly afterDelete: () => HTMLElement | null;
  },
) {
  const [deleting, setDeleting] = useState(false);
  const chat = props.view?.chat;
  if (chat === undefined || chat.draft) return null;
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
            label={words.moreActions(chat.title)}
          />
        )}
        entries={[
          ...(props.onRename === undefined
            ? []
            : [
                { id: "rename", label: words.rename, onSelect: props.onRename },
                "divider" as const,
              ]),
          {
            id: "delete",
            label: words.deleteChat,
            danger: true,
            onSelect: () => setDeleting(true),
          },
        ]}
      />
      {deleting ? (
        <DeleteChatDialog
          chats={props.chats}
          chat={chat}
          onClose={() => setDeleting(false)}
          afterDelete={props.afterDelete}
          announce={props.announce}
        />
      ) : null}
    </>
  );
}

/**
 * "Delete the chat …?" (`assistant.chat.delete`), with the line about its changes to review when
 * it left some. On a phone the kit's Dialog stacks it: **Delete chat** on top, Cancel under it.
 */
export function DeleteChatDialog(props: {
  readonly chats: BuildChats;
  readonly chat: ChatSummary;
  readonly onClose: () => void;
  /** Where focus goes once the chat is deleted: the empty panel's New chat (flow 2.2). */
  readonly afterDelete: () => HTMLElement | null;
  readonly announce: Announce;
}) {
  const { chat, onClose } = props;
  const [deleting, setDeleting] = useState<"asking" | "busy" | { failed: string }>("asking");
  const remove = () => {
    setDeleting("busy");
    props.chats.deleteChat(chat.id).then(
      () => {
        // Focus moves on to New chat, which doesn't say the chat is gone (a11y AS5).
        props.announce(words.deleted(chat.title), "polite");
        onClose();
      },
      (error: unknown) =>
        setDeleting({ failed: error instanceof Error ? error.message : String(error) }),
    );
  };
  return (
    <Dialog
      title={words.deleteTitle(chat.title)}
      size="sm"
      confirm={{ label: words.deleteConfirm, variant: "danger", busyLabel: words.deleting }}
      busy={deleting === "busy"}
      {...(typeof deleting === "object" ? { error: words.cantDelete(deleting.failed) } : {})}
      onConfirm={remove}
      onCancel={onClose}
      returnFocus={props.afterDelete}
    >
      {chat.itemsToReview > 0 ? <p>{words.deleteBody(chat.itemsToReview)}</p> : null}
    </Dialog>
  );
}

/**
 * The title as a field with its text selected (`assistant.chat.rename`): Enter or leaving saves
 * it trimmed, an empty title puts the old one back, Escape cancels.
 */
export function RenameField({
  chats,
  chatId,
  title,
  onDone,
}: {
  readonly chats: BuildChats;
  readonly chatId: string;
  readonly title: string;
  readonly onDone: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => field.current?.select(), []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const typed = field.current?.value ?? "";
    // A rename the host refuses keeps the old title, as an empty one does.
    void (save ? chats.rename(chatId, typed) : Promise.resolve()).catch(() => {}).finally(onDone);
  };
  return (
    <input
      ref={field}
      aria-label={words.renameField(title)}
      defaultValue={title}
      className="w-full min-w-0 rounded-sm border border-border-control bg-surface px-2 text-section text-fg"
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(true);
        if (event.key === "Escape") {
          // The panel's own Escape would close it: here it only cancels the rename.
          event.stopPropagation();
          finish(false);
        }
      }}
    />
  );
}

/** The kept chats, read again whenever the list changes (one added, renamed, deleted, busy). */
export function useRecentChats(host: AssistantHost): readonly ChatSummary[] {
  const [recent, setRecent] = useState<readonly ChatSummary[]>([]);
  useEffect(() => {
    let live = true;
    const read = () =>
      void host.chats().then(
        (chats) => live && setRecent(chats),
        () => {},
      );
    read();
    const stop = host.onDidChange((change) => {
      if (change.kind !== "chat") read();
    });
    return () => {
      live = false;
      stop();
    };
  }, [host]);
  return recent;
}
