import type { Conversation, Message, MessageReaction, MessagingAgent } from "@halonicjs/ports";
import { loadPhoneChat, type PhoneChatProps } from "@halonicjs/studio-feature-remote/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The phone's chat with reactions (HAL-20426), for the look check: Elena's message with the
 * person's 👍 (pressed) and Ravi's 👀 under it, then the person's own reply with Elena's ❤️. The
 * spec opens the long-press sheet itself. A made-up Acme computer that speaks reactions answers
 * every read; nothing reaches a real one.
 */

const source = "acme-paperclip";
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const elena: MessagingAgent = {
  id: "acme-elena",
  source,
  name: "Elena",
  title: "Studio Engineer",
  activity: "idle",
};

const conversation: Conversation = {
  id: "acme-chat",
  source,
  agent: elena.id,
  title: "Release notes",
  updatedAt: minutesAgo(12),
  waitingForMe: false,
};

/** Newest first, as a page of messages comes. */
const messages: readonly Message[] = [
  {
    id: "m2",
    conversation: conversation.id,
    author: { kind: "me" },
    body: "Thanks, I'll read them after lunch.",
    attachments: [],
    sentAt: minutesAgo(12),
  },
  {
    id: "m1",
    conversation: conversation.id,
    author: { kind: "agent", agent: elena.id, name: elena.name },
    body: "Morning! The Acme release notes are ready for a look. I kept them to one page.",
    attachments: [],
    sentAt: minutesAgo(15),
  },
];

const reactions: readonly { message: string; reactions: readonly MessageReaction[] }[] = [
  {
    message: "m1",
    reactions: [
      { emoji: "👍", by: { kind: "me" }, at: minutesAgo(13) },
      { emoji: "👀", by: { kind: "agent", agent: "acme-ravi", name: "Ravi" }, at: minutesAgo(14) },
    ],
  },
  {
    message: "m2",
    reactions: [
      { emoji: "❤️", by: { kind: "agent", agent: elena.id, name: "Elena" }, at: minutesAgo(11) },
    ],
  },
];

const notOnThisPage = async (): Promise<never> => {
  throw new Error("The phone reactions page only reads its one chat.");
};

/** The made-up computer: its one chat's messages and reactions; a reaction keeps what is shown. */
const messaging: PhoneChatProps["messaging"] = {
  readList: notOnThisPage,
  send: notOnThisPage,
  readMessages: async () => ({ kind: "done", value: { items: messages, more: undefined } }),
  readReactions: async () => ({ kind: "done", value: { items: reactions, more: undefined } }),
  react: async (_conversation, message) => ({
    kind: "done",
    value: reactions.find((entry) => entry.message === message)?.reactions ?? [],
  }),
};

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The phone reactions page needs its #root element (phone-reactions.html).");
}
void loadPhoneChat().then(({ PhoneChat }) => {
  createRoot(root).render(
    <StrictMode>
      <div className="flex min-h-dvh flex-col bg-surface text-fg">
        <PhoneChat
          messaging={messaging}
          conversation={conversation}
          agents={new Map([[elena.id, elena]])}
          sources={new Map([[source, "Acme · Paperclip"]])}
          computer="Acme laptop"
          draft={{ text: "", line: undefined, sending: false, sent: 0 }}
          onKeep={() => undefined}
          onSend={async () => false}
          onOpenLink={() => undefined}
          onBack={() => undefined}
        />
      </div>
    </StrictMode>,
  );
});
