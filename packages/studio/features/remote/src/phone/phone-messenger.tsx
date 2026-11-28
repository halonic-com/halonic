import type { Conversation, MessagingAgent, MessagingId, MessagingSource } from "@halonicjs/ports";
import { EmptyState, FilterChips } from "@halonicjs/studio-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChatDrafts } from "./chat-drafts.ts";
import type { MessagingClient } from "./messaging-client.ts";
import { OlderComputerPanel } from "./older-computer-note.tsx";
import { PhoneChat } from "./phone-chat.tsx";
import { ChatRows, ChatsSkeleton, type ReturnTo, useFocusOnReturn } from "./phone-chat-rows.tsx";
import { type ReadFailure, phoneMessengerWords as words } from "./phone-messenger-words.ts";
import { ReadFailedLine } from "./read-failed-line.tsx";

/** What the Messenger tab asks of the computer: the client's reads, its send and reactions. */
export type PhoneMessaging = Pick<
  MessagingClient,
  "readList" | "readMessages" | "send" | "readReactions" | "react"
>;

/** What the Messenger tab needs from the page round it. */
export interface PhoneMessengerProps {
  readonly messaging: PhoneMessaging;
  /** The paired computer's name, for the lines that name it. */
  readonly computer: string;
  /** `RemoteView.olderComputer`: the computer speaks only version 3, so there's no Messenger. */
  readonly olderComputer: boolean;
  /** Opens a link `isAllowedWebLink` passed in the system browser. */
  readonly onOpenLink: (link: string) => void;
  /** The id of the chat the last-chat shortcut opens, until `onLanded` (HAL-20160). */
  readonly landing?: string | undefined;
  /** A chat opened, tapped or landed on: the phone makes it the last-chat shortcut. */
  readonly onOpened?: (conversation: Conversation) => void;
  /** The landing chat opened, or the list shows because the chat is gone. */
  readonly onLanded?: () => void;
}

/** The agents read, by id: a chat's picture, name and status line, the `@` picker and Members. */
export type ChatAgents = ReadonlyMap<MessagingId, MessagingAgent>;

/** The sources read, their labels by id: "name · source" on a row and in a chat's header. */
export type SourceLabels = ReadonlyMap<MessagingId, string>;

/** Pages read of a list at most, so a host that always says `more` can't keep the phone reading. */
const maxPages = 10;

/**
 * The phone's Messenger tab (flow C on HAL-17509, p02b): the conversations, All or Waiting for me,
 * and a tapped one's chat in their place (requirement `remote.phone-messenger`). The phone only
 * reads and writes chats: it has no control to start a chat or a channel, join or leave one, or
 * change its members; those stay on the computer. While the computer speaks only version 3 it
 * shows the update note instead and asks the computer nothing. A list or chat it couldn't read
 * says why, with Try again, instead of showing an empty screen.
 */
export function PhoneMessenger(props: PhoneMessengerProps) {
  if (props.olderComputer) return <OlderComputerPanel computer={props.computer} />;
  return <MessengerLists {...props} />;
}

function MessengerLists({
  messaging,
  computer,
  onOpenLink,
  landing,
  onOpened,
  onLanded,
}: PhoneMessengerProps) {
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [open, setOpen] = useState<Conversation | undefined>(undefined);
  // The chat Back came from, whose row takes the focus back, and the chips and rows it's found in.
  const returnTo = useRef<ReturnTo | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const openChat = (conversation: Conversation) => {
    setOpen(conversation);
    onOpened?.(conversation);
  };
  // What was left in a chat's box, its line and its send, per chat, while the tab is open: its
  // row's "Draft: …". The box keeps its own text while open, so typing redraws only the box.
  const drafts = useChatDrafts(messaging, computer);
  const listed = useListRead(messaging, "conversations", isConversation, open === undefined);
  const agentsRead = useListRead(messaging, "agents", isAgent, open === undefined);
  // Only labels a row: a sources read that fails leaves rows without them, and says nothing.
  const sourcesRead = useListRead(messaging, "sources", isSource, open === undefined);
  const agents: ChatAgents = useMemo(
    () => new Map(agentsRead.items.map((agent) => [agent.id, agent])),
    [agentsRead.items],
  );
  const sources: SourceLabels = useMemo(
    () => new Map(sourcesRead.items.map((source) => [source.id, source.label])),
    [sourcesRead.items],
  );
  const failure = listed.failure ?? agentsRead.failure;
  const conversations = listed.items;
  const waiting = useMemo(
    () => conversations.filter((conversation) => conversation.waitingForMe),
    [conversations],
  );
  const shown = waitingOnly ? waiting : conversations;
  // On Back and on the rows shown, not on every draw: the remote view draws the list again on
  // each event.
  useFocusOnReturn(listRef, returnTo, open === undefined ? shown : undefined);
  // The shortcut's chat opens once the list has answered; a chat that's gone leaves the list.
  useEffect(() => {
    if (landing === undefined || !listed.read) return;
    const landed = conversations.find((conversation) => conversation.id === landing);
    if (landed !== undefined) {
      setOpen(landed);
      onOpened?.(landed);
    }
    onLanded?.();
  }, [landing, listed.read, conversations, onOpened, onLanded]);

  if (open !== undefined) {
    return (
      <PhoneChat
        key={open.id}
        messaging={messaging}
        conversation={open}
        agents={agents}
        sources={sources}
        computer={computer}
        draft={drafts.draftOf(open.id)}
        onKeep={(text) => drafts.keep(open.id, text)}
        onSend={drafts.send}
        onOpenLink={onOpenLink}
        onBack={() => {
          returnTo.current = { id: open.id, placed: false };
          setOpen(undefined);
        }}
      />
    );
  }
  const retry = () => {
    listed.retry();
    agentsRead.retry();
    sourcesRead.retry();
  };
  // A phone read waits for the computer's answer or a drop, so a slow computer leaves the skeleton
  // up with no failure: its Try again reads the chats again all the same (HAL-19093 review).
  const reload = () => {
    listed.reload();
    agentsRead.reload();
  };
  const failedLine = (
    <ReadFailedLine
      messaging={messaging}
      failure={failure}
      computer={computer}
      onTryAgain={retry}
    />
  );
  // No chips and no "No chats yet" until the computer has answered: a list still on its way or
  // one that couldn't be read isn't an empty one (HAL-20039).
  if (!listed.read || conversations.length === 0) {
    if (failure !== undefined) return failedLine;
    if (!listed.read) return <ChatsSkeleton onRetry={reload} />;
    return (
      <div className="flex flex-1 flex-col justify-center">
        <EmptyState title={words.emptyTitle} description={words.emptyText(computer)} />
      </div>
    );
  }
  return (
    <div ref={listRef} className="flex flex-col gap-3">
      <FilterChips
        label={words.title}
        flush
        options={[
          { value: "all", label: words.all },
          { value: "waiting", label: words.waitingChip(waiting.length) },
        ]}
        value={waitingOnly ? "waiting" : "all"}
        onChange={(value) => setWaitingOnly(value === "waiting")}
      />
      {failedLine}
      {shown.length === 0 ? (
        <p className="px-3 py-4 text-small text-fg-muted">{words.nothingWaiting}</p>
      ) : (
        <ChatRows
          conversations={shown}
          agents={agents}
          sources={sources}
          drafts={drafts.texts}
          now={new Date()}
          onOpen={openChat}
        />
      )}
    </div>
  );
}

/** A list read whole, why its newest read failed, and a way to read it again. */
interface ListRead<Item> {
  readonly items: readonly Item[];
  readonly failure: ReadFailure | undefined;
  /** A read has answered whole at least once, so an empty list is empty, not loading. */
  readonly read: boolean;
  /** Reads the list again, only if its newest read failed. */
  readonly retry: () => void;
  /** Reads the list again whether or not its newest read failed, as for a read still waiting. */
  readonly reload: () => void;
}

/** Reads `what` whole while `active`, again each time it turns active or `retry` is called. */
function useListRead<Item>(
  messaging: PhoneMessaging,
  what: "conversations" | "agents" | "sources",
  isItem: (item: unknown) => item is Item,
  active: boolean,
): ListRead<Item> {
  const [items, setItems] = useState<readonly Item[]>([]);
  const [failure, setFailure] = useState<ReadFailure | undefined>(undefined);
  const [read, setRead] = useState(false);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    if (!active) return;
    let current = true;
    void readAll(messaging, what, isItem).then((result) => {
      if (!current) return;
      setItems(result.items);
      setFailure(result.failure);
      if (result.failure === undefined) setRead(true);
    });
    return () => {
      current = false;
    };
  }, [messaging, what, isItem, active, reads]);

  const reload = () => {
    setFailure(undefined);
    // Loading again until it answers, so a list that failed empty doesn't read as "No chats yet".
    setRead(false);
    setReads((count) => count + 1);
  };
  const retry = () => {
    if (failure !== undefined) reload();
  };
  return { items, failure, read, retry, reload };
}

/** Every page of `what`, up to {@link maxPages}; what was read so far and why when a read fails. */
async function readAll<Item>(
  messaging: PhoneMessaging,
  what: "conversations" | "agents" | "sources",
  isItem: (item: unknown) => item is Item,
): Promise<{ readonly items: readonly Item[]; readonly failure: ReadFailure | undefined }> {
  const items: Item[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const read = await messaging.readList(what, cursor);
    if (read.kind !== "done") return { items, failure: read };
    items.push(...read.value.items.filter(isItem));
    cursor = read.value.more;
    if (cursor === undefined) break;
  }
  return { items, failure: undefined };
}

function isConversation(item: unknown): item is Conversation {
  return (
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    typeof item.id === "string" &&
    "title" in item &&
    typeof item.title === "string" &&
    "agent" in item &&
    typeof item.agent === "string"
  );
}

function isAgent(item: unknown): item is MessagingAgent {
  return (
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    typeof item.id === "string" &&
    "name" in item &&
    typeof item.name === "string"
  );
}

function isSource(item: unknown): item is MessagingSource {
  return (
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    typeof item.id === "string" &&
    "label" in item &&
    typeof item.label === "string"
  );
}
