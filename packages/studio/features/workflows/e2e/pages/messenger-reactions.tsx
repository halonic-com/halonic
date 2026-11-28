import type { AgentMessaging, Message, MessagingAgent } from "@halonicjs/ports";
import {
  type ConversationRow,
  loadMessengerTranscript,
} from "@halonicjs/studio-feature-messenger/api";
import { engineWords } from "@halonicjs/studio-shell";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The desktop Messenger's chat in a 600 px pane (HAL-20426), for the look check of the "Add a
 * reaction" row beside short messages: Elena's "Morning" and the person's "Thanks", each with a
 * reaction under it. The spec opens the row beside each. A made-up Acme source keeps the
 * reactions; nothing reaches a real one.
 */

const source = "acme-paperclip";
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const elena: MessagingAgent = { id: "acme-elena", source, name: "Elena", activity: "idle" };

const row: ConversationRow = {
  conversation: {
    id: "acme-chat",
    source,
    agent: elena.id,
    title: "Elena",
    updatedAt: minutesAgo(5),
    waitingForMe: false,
  },
  agents: [elena],
  sourceAgents: [elena],
  source: {
    id: source,
    provider: "paperclip",
    label: "Acme · Paperclip",
    state: { kind: "online", asOf: minutesAgo(1) },
  },
};

const messages: readonly Message[] = [
  {
    id: "m1",
    conversation: row.conversation.id,
    author: { kind: "agent", agent: elena.id, name: elena.name },
    body: "Morning",
    attachments: [],
    sentAt: minutesAgo(8),
  },
  {
    id: "m2",
    conversation: row.conversation.id,
    author: { kind: "me" },
    body: "Thanks",
    attachments: [],
    sentAt: minutesAgo(5),
  },
];

const notOnThisPage = async (): Promise<never> => {
  throw new Error("The Messenger reactions page only shows its one chat.");
};

/** A source that answers nothing: the transcript gets its messages straight from the page. */
const messaging: AgentMessaging = {
  listSources: notOnThisPage,
  listAgents: notOnThisPage,
  listConversations: notOnThisPage,
  listMessages: notOnThisPage,
  listInboxItems: notOnThisPage,
  listWork: notOnThisPage,
  search: notOnThisPage,
  answer: notOnThisPage,
  readAttachment: notOnThisPage,
  send: notOnThisPage,
  startChannel: notOnThisPage,
  setMembers: notOnThisPage,
  browseChannels: notOnThisPage,
  joinChannel: notOnThisPage,
  leaveChannel: notOnThisPage,
  changes: () => ({
    [Symbol.asyncIterator]: () => ({ next: notOnThisPage }),
  }),
};

const root = document.getElementById("root");
if (root === null) {
  throw new Error(
    "The Messenger reactions page needs its #root element (messenger-reactions.html).",
  );
}
void loadMessengerTranscript().then(({ Transcript, Messenger }) => {
  createRoot(root).render(
    <StrictMode>
      <div className="flex h-dvh w-[600px] flex-col bg-surface text-fg">
        <Transcript
          messenger={new Messenger(messaging)}
          row={row}
          messages={messages}
          cards={[]}
          pending={[]}
          questions={new Map()}
          searching={false}
          failure={undefined}
          words={engineWords["desktop-app"]}
          onRetry={() => undefined}
          onAsked={async () => undefined}
          picture={undefined}
          onAnswered={async () => undefined}
          reactions={{
            byMessage: {
              m1: [{ emoji: "👍", by: { kind: "me" }, at: minutesAgo(7) }],
              m2: [
                {
                  emoji: "❤️",
                  by: { kind: "agent", agent: elena.id, name: elena.name },
                  at: minutesAgo(4),
                },
              ],
            },
            canReact: true,
            toggle: () => undefined,
          }}
          announce={() => undefined}
        />
      </div>
    </StrictMode>,
  );
});
