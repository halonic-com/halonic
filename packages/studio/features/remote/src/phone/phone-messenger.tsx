import type { Conversation, MessagingAgent, MessagingId } from "@halonicjs/ports";
import { FilterChips } from "@halonicjs/studio-kit";
import { useEffect, useState } from "react";
import type { MessagingClient } from "./messaging-client.ts";
import { OlderComputerNote } from "./older-computer-note.tsx";
import { PhoneChat } from "./phone-chat.tsx";
import { phoneMessengerWords as words } from "./phone-messenger-words.ts";

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
 * shows the update note instead and asks the computer nothing.
 */
export function PhoneMessenger(props: PhoneMessengerProps) {
  if (props.olderComputer) return <OlderComputerNote computer={props.computer} />;
  return <MessengerLists {...props} />;
}

function MessengerLists({ messaging, computer, onOpenLink }: PhoneMessengerProps) {
  const [conversations, setConversations] = useState<readonly Conversation[]>([]);
  const [names, setNames] = useState<AgentNames>(() => new Map());
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [open, setOpen] = useState<Conversation | undefined>(undefined);

  useEffect(() => {
    if (open !== undefined) return;
    let current = true;
    void readAll(messaging, "conversations", isConversation).then((read) => {
      if (current) setConversations(read);
    });
    void readAll(messaging, "agents", isAgent).then((read) => {
      if (current) setNames(new Map(read.map((agent) => [agent.id, agent.name])));
    });
    return () => {
      current = false;
    };
  }, [messaging, open]);

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
  const waiting = conversations.filter((conversation) => conversation.waitingForMe);
  const shown = waitingOnly ? waiting : conversations;
  return (
    <div className="flex flex-col gap-3 p-4">
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
      <ul className="flex flex-col">
        {shown.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              className="flex min-h-12 w-full items-center rounded-md px-2 text-left text-body text-fg focus-ring"
              onClick={() => setOpen(conversation)}
            >
              {conversation.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every page of `what`, up to {@link maxPages}; what was read so far when a read fails. */
async function readAll<Item>(
  messaging: PhoneMessaging,
  what: "conversations" | "agents",
  isItem: (item: unknown) => item is Item,
): Promise<readonly Item[]> {
  const items: Item[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const read = await messaging.readList(what, cursor);
    if (read.kind !== "done") break;
    items.push(...read.value.items.filter(isItem));
    cursor = read.value.more;
    if (cursor === undefined) break;
  }
  return items;
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
