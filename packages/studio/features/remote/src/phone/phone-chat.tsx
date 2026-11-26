import { type Conversation, gatewayMaxPromptLength, type Message } from "@halonicjs/ports";
import { BackIcon, Button, Dialog, TextArea } from "@halonicjs/studio-kit";
import { useEffect, useId, useState } from "react";
import { messageParts, openChecked } from "./message-links.ts";
import type { MessagingOutcome } from "./messaging-client.ts";
import type { AgentNames, PhoneMessaging } from "./phone-messenger.tsx";
import {
  type ReadFailure,
  sendLine,
  phoneMessengerWords as words,
} from "./phone-messenger-words.ts";
import { ReadFailedLine } from "./read-failed-line.tsx";

/** What a chat on the phone needs. */
export interface PhoneChatProps {
  readonly messaging: PhoneMessaging;
  readonly conversation: Conversation;
  readonly names: AgentNames;
  readonly computer: string;
  readonly onOpenLink: (link: string) => void;
  readonly onBack: () => void;
}

/**
 * One chat on the phone (p04a): its messages, oldest first, and the box under them. In a channel,
 * `@` opens Name someone (k16b), whose picks fill the message's `to`, and Members lists who is in
 * it, read-only (k16c). Messages it couldn't read show why, with Try again.
 */
export function PhoneChat(props: PhoneChatProps) {
  const { messaging, conversation, names, computer, onOpenLink, onBack } = props;
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [to, setTo] = useState<readonly string[]>([]);
  const [sheet, setSheet] = useState<"none" | "name" | "members">("none");
  const [reads, setReads] = useState(0);
  const [failure, setFailure] = useState<ReadFailure | undefined>(undefined);
  const members = conversation.members ?? [];
  const nameOf = (agent: string) => names.get(agent) ?? agent;

  useEffect(() => {
    let current = true;
    void messaging.readMessages(conversation.id).then((read) => {
      if (!current) return;
      if (read.kind !== "done") {
        setFailure(read);
        return;
      }
      setFailure(undefined);
      // Pages come newest first; the chat shows the oldest first.
      setMessages(read.value.items.filter(isMessage).reverse());
    });
    return () => {
      current = false;
    };
  }, [messaging, conversation.id, reads]);

  const toggle = (agent: string) => {
    setTo((before) =>
      before.includes(agent) ? before.filter((each) => each !== agent) : [...before, agent],
    );
    setSheet("none");
  };

  return (
    <div className="flex grow flex-col">
      <header className="flex min-h-14 items-center gap-2 border-b border-border px-2">
        <Button variant="ghost" size="touch" icon={<BackIcon />} label="Back" onClick={onBack} />
        <h2 className="min-w-0 flex-1 truncate text-heading text-fg">{conversation.title}</h2>
        {members.length > 0 ? (
          <Button variant="ghost" size="touch" onClick={() => setSheet("members")}>
            {words.members}
          </Button>
        ) : null}
      </header>
      <ReadFailedLine
        messaging={messaging}
        failure={failure}
        computer={computer}
        onTryAgain={() => {
          setFailure(undefined);
          setReads((count) => count + 1);
        }}
      />
      <ol className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <li key={message.id} className={message.author.kind === "me" ? "self-end" : ""}>
            <MessageBody body={message.body} onOpenLink={onOpenLink} />
          </li>
        ))}
      </ol>
      <ChatBox
        {...props}
        to={to}
        toLine={to.length > 0 ? words.to(to.map(nameOf)) : undefined}
        onNameSomeone={members.length > 0 ? () => setSheet("name") : undefined}
        onSent={() => {
          setTo([]);
          setReads((count) => count + 1);
        }}
      />
      {sheet === "none" ? null : (
        <ChatSheet
          sheet={sheet}
          conversation={conversation}
          to={to}
          nameOf={nameOf}
          computer={computer}
          onToggle={toggle}
          onClose={() => setSheet("none")}
        />
      )}
    </div>
  );
}

/**
 * The box under a chat. A message is sent once: after anything but the host taking it, the text
 * stays and the line under the box says why, and a send cut off by a drop is never sent again.
 */
function ChatBox({
  messaging,
  conversation,
  computer,
  to,
  toLine,
  onNameSomeone,
  onSent,
}: PhoneChatProps & {
  readonly to: readonly string[];
  readonly toLine: string | undefined;
  /** Opens Name someone; none outside a channel. */
  readonly onNameSomeone: (() => void) | undefined;
  readonly onSent: () => void;
}) {
  const lineId = useId();
  const [text, setText] = useState("");
  const [line, setLine] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const tooLong = text.length > gatewayMaxPromptLength;
  const canSend = !sending && !tooLong && text.trim() !== "";

  async function send() {
    if (!canSend) return;
    setSending(true);
    setLine(undefined);
    let outcome: MessagingOutcome<unknown>;
    try {
      outcome = await messaging.send(conversation, text, to);
    } catch {
      // A port that rejects never said what became of the message: treat it as cut off.
      outcome = { kind: "cut-off" };
    } finally {
      setSending(false);
    }
    setLine(sendLine(outcome, computer));
    if (outcome.kind !== "done") return;
    setText("");
    onSent();
  }

  return (
    <div className="flex flex-col gap-1 border-t border-border px-3 pt-2 pb-safe">
      {toLine === undefined ? null : <p className="text-small text-fg-muted">{toLine}</p>}
      <div className="flex items-end gap-2">
        {onNameSomeone === undefined ? null : (
          <Button variant="ghost" size="touch" name={words.nameSomeone} onClick={onNameSomeone}>
            @
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <TextArea
            aria-label={words.label}
            placeholder={words.placeholder(conversation.title)}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <Button
          variant="primary"
          size="touch"
          busy={sending}
          unavailable={tooLong ? { reason: lineId } : undefined}
          onClick={() => void send()}
        >
          {words.send}
        </Button>
      </div>
      <p id={lineId} role="status" className="text-small text-fg-muted">
        {tooLong ? words.tooLong : line}
      </p>
    </div>
  );
}

/** An agent's message, its links showing their full address (`messageParts`). */
function MessageBody({
  body,
  onOpenLink,
}: {
  readonly body: string;
  readonly onOpenLink: (link: string) => void;
}) {
  return (
    <p className="whitespace-pre-wrap break-words text-body text-fg">
      {messageParts(body).map((part, index) =>
        part.kind === "text" ? (
          // Parts never reorder, so the index is the key.
          <span key={index}>{part.text}</span>
        ) : (
          <button
            key={index}
            type="button"
            className="break-all text-left text-accent-text underline focus-ring"
            onClick={() => openChecked(part.link, undefined, onOpenLink)}
          >
            {part.link}
          </button>
        ),
      )}
    </p>
  );
}

/**
 * Name someone (k16b), whose picks fill `to` with members only, or Members, read-only (k16c):
 * changing who is in a channel stays on the computer.
 */
function ChatSheet({
  sheet,
  conversation,
  to,
  nameOf,
  computer,
  onToggle,
  onClose,
}: {
  readonly sheet: "name" | "members";
  readonly conversation: Conversation;
  readonly to: readonly string[];
  readonly nameOf: (agent: string) => string;
  readonly computer: string;
  readonly onToggle: (agent: string) => void;
  readonly onClose: () => void;
}) {
  const members = conversation.members ?? [];
  if (sheet === "name") {
    return (
      <Dialog title={words.nameSomeone} size="sm" onCancel={onClose}>
        <ul className="flex flex-col">
          {members.map((agent) => (
            <li key={agent}>
              <button
                type="button"
                aria-pressed={to.includes(agent)}
                className="flex min-h-12 w-full items-center rounded-md px-2 text-left text-body text-fg focus-ring"
                onClick={() => onToggle(agent)}
              >
                {nameOf(agent)}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    );
  }
  return (
    <Dialog title={words.members} size="sm" onCancel={onClose}>
      <ul className="flex flex-col gap-2">
        {members.map((agent) => (
          <li key={agent} className="flex items-center gap-2 text-body text-fg">
            {nameOf(agent)}
            {agent === conversation.agent ? (
              <span className="text-small text-fg-muted">{words.lead}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-small text-fg-muted">{words.membersOnComputer(computer)}</p>
    </Dialog>
  );
}

function isMessage(item: unknown): item is Message {
  return (
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    typeof item.id === "string" &&
    "body" in item &&
    typeof item.body === "string" &&
    "author" in item &&
    typeof item.author === "object" &&
    item.author !== null
  );
}
