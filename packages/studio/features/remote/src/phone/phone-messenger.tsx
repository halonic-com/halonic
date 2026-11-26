import type { Conversation, MessagingAgent, MessagingId } from "@halonicjs/ports";
import { EmptyState, FilterChips } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { MessagingClient } from "./messaging-client.ts";
import { OlderComputerPanel } from "./older-computer-note.tsx";
import { PhoneChat } from "./phone-chat.tsx";
import { type ReadFailure, phoneMessengerWords as words } from "./phone-messenger-words.ts";
import { ReadFailedLine } from "./read-failed-line.tsx";

/** What the Messenger tab asks of the computer: the messaging client's reads and its send. */
export type PhoneMessaging = Pick<MessagingClient, "readList" | "readMessages" | "send">;

/** What the Messenger tab needs from the page round it. */
export interface PhoneMessengerProps {
  readonly messaging: PhoneMessaging;
  /** The paired computer's name, for the lines that name it. */
  readonly computer: string;
  /** `RemoteView.olderComputer`: the computer speaks only version 3, so there's no Messenger. */
  readonly olderComputer: boolean;
  /** Opens a link `isAllowedWebLink` passed in the system browser. */
  readonly onOpenLink: (link: string) => void;
}

/** Agents' names by id, for the `@` sheet, the To line and Members. */
export type AgentNames = ReadonlyMap<MessagingId, string>;

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

function MessengerLists({ messaging, computer, onOpenLink }: PhoneMessengerProps) {
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [open, setOpen] = useState<Conversation | undefined>(undefined);
  const listed = useListRead(messaging, "conversations", isConversation, open === undefined);
  const agents = useListRead(messaging, "agents", isAgent, open === undefined);
  const names: AgentNames = useMemo(
    () => new Map((agents.items ?? []).map((agent) => [agent.id, agent.name])),
    [agents.items],
  );
  const failure = listed.failure ?? agents.failure;
  const conversations = listed.items;

  if (open !== undefined) {
    return (
      <PhoneChat
        key={open.id}
        messaging={messaging}
        conversation={open}
        names={names}
        computer={computer}
        onOpenLink={onOpenLink}
        onBack={() => setOpen(undefined)}
      />
    );
  }
  const failedLine = (
    <ReadFailedLine
      messaging={messaging}
      failure={failure}
      computer={computer}
      onTryAgain={() => {
        listed.retry();
        agents.retry();
      }}
    />
  );
  // No chips and no "No chats yet" until the computer has answered: a list still on its way or
  // one that couldn't be read isn't an empty one.
  if (conversations === undefined || conversations.length === 0) {
    return (
      <ListPlaceholder
        failedLine={failure === undefined ? undefined : failedLine}
        answered={conversations !== undefined}
        computer={computer}
      />
    );
  }
  return (
    <ConversationList
      conversations={conversations}
      failedLine={failedLine}
      waitingOnly={waitingOnly}
      onWaitingOnly={setWaitingOnly}
      onOpen={setOpen}
    />
  );
}

/** p02b: the chips, All or Waiting for me, over the chats; the filter outlives an opened chat. */
function ConversationList({
  conversations,
  failedLine,
  waitingOnly,
  onWaitingOnly,
  onOpen,
}: {
  readonly conversations: readonly Conversation[];
  readonly failedLine: ReactNode;
  readonly waitingOnly: boolean;
  readonly onWaitingOnly: (waitingOnly: boolean) => void;
  readonly onOpen: (conversation: Conversation) => void;
}) {
  const waiting = conversations.filter((conversation) => conversation.waitingForMe);
  const shown = waitingOnly ? waiting : conversations;
  return (
    <div className="flex flex-col gap-3">
      <FilterChips
        label={words.title}
        flush
        options={[
          { value: "all", label: words.all },
          { value: "waiting", label: words.waitingChip(waiting.length) },
        ]}
        value={waitingOnly ? "waiting" : "all"}
        onChange={(value) => onWaitingOnly(value === "waiting")}
      />
      {failedLine}
      {shown.length === 0 ? (
        <p className="text-small text-fg-muted">{words.nothingWaiting}</p>
      ) : null}
      <ul className="flex flex-col">
        {shown.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              className="flex min-h-12 w-full items-center rounded-md px-2 text-left text-body text-fg focus-ring"
              onClick={() => onOpen(conversation)}
            >
              {conversation.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The tab before it has chats to list: why the read failed, "Loading Messenger" until the computer
 * answers, or the empty state once it said it has none.
 */
function ListPlaceholder({
  failedLine,
  answered,
  computer,
}: {
  readonly failedLine: ReactNode;
  readonly answered: boolean;
  readonly computer: string;
}) {
  if (failedLine !== undefined) return failedLine;
  if (!answered) {
    return (
      <p role="status" className="text-small text-fg-muted">
        {words.loading}
      </p>
    );
  }
  return (
    <div className="flex flex-1 flex-col justify-center">
      <EmptyState title={words.emptyTitle} description={words.emptyText(computer)} />
    </div>
  );
}

/** A list read whole, why its newest read failed, and a way to read it again. */
interface ListRead<Item> {
  /** `undefined` until the computer answers the first read, and again while a retry is out. */
  readonly items: readonly Item[] | undefined;
  readonly failure: ReadFailure | undefined;
  /** Reads the list again, only if its newest read failed. */
  readonly retry: () => void;
}

/** Reads `what` whole while `active`, again each time it turns active or `retry` is called. */
function useListRead<Item>(
  messaging: PhoneMessaging,
  what: "conversations" | "agents",
  isItem: (item: unknown) => item is Item,
  active: boolean,
): ListRead<Item> {
  const [items, setItems] = useState<readonly Item[] | undefined>(undefined);
  const [failure, setFailure] = useState<ReadFailure | undefined>(undefined);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    if (!active) return;
    let current = true;
    void readAll(messaging, what, isItem).then((read) => {
      if (!current) return;
      setItems(read.items);
      setFailure(read.failure);
    });
    return () => {
      current = false;
    };
  }, [messaging, what, isItem, active, reads]);

  const retry = () => {
    if (failure === undefined) return;
    setFailure(undefined);
    // Back to loading, so a list that failed empty doesn't read as "No chats yet" meanwhile.
    setItems(undefined);
    setReads((count) => count + 1);
  };
  return { items, failure, retry };
}

/** Every page of `what`, up to {@link maxPages}; what was read so far and why when a read fails. */
async function readAll<Item>(
  messaging: PhoneMessaging,
  what: "conversations" | "agents",
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
