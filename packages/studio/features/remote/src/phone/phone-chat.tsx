import {
  type Conversation,
  gatewayMaxPromptLength,
  type Message,
  type MessagingId,
} from "@halonicjs/ports";
import {
  Button,
  ChatBoxLine,
  ChatComposer,
  type ChatComposerPicker,
  ChatLoading,
  TickIcon,
} from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { ChatDraft } from "./chat-drafts.ts";
import {
  authorName,
  ChatHeader,
  ChatLines,
  isChannel,
  isMessage,
  MembersSheet,
  nameOf,
} from "./phone-chat-parts.tsx";
import type { ChatAgents, PhoneMessaging, SourceLabels } from "./phone-messenger.tsx";
import { type ReadFailure, phoneMessengerWords as words } from "./phone-messenger-words.ts";
import { phoneReactionWords } from "./phone-reaction-words.ts";
import { ReactionSheet } from "./phone-reactions.tsx";
import { ReadFailedLine } from "./read-failed-line.tsx";
import { usePhoneReactions } from "./use-phone-reactions.ts";

/** What a chat on the phone needs. */
export interface PhoneChatProps {
  readonly messaging: PhoneMessaging;
  readonly conversation: Conversation;
  readonly agents: ChatAgents;
  readonly sources: SourceLabels;
  readonly computer: string;
  /** The chat's draft in the list: the box starts with its text and follows its line and send. */
  readonly draft: ChatDraft;
  /** Gets what is left in the box when the chat closes, for the chat row's "Draft: …". */
  readonly onKeep: (text: string) => void;
  /** Sends through the list, so the send outlives the chat; true when the computer took it. */
  readonly onSend: (
    conversation: Conversation,
    text: string,
    to: readonly MessagingId[],
  ) => Promise<boolean>;
  readonly onOpenLink: (link: string) => void;
  readonly onBack: () => void;
}

/**
 * One chat on the phone (p04a): its header, its messages, oldest first, and the kit's box under
 * them. In a channel, `@` (typed, or the Name someone button) opens the box's picker of members
 * (k16b), whose picks fill the message's `to`, each named member ticked; Members lists who is in
 * it, read-only (k16c). Until the messages are read, the kit's skeleton lines stand in their place;
 * messages it couldn't read show why, with Try again. While the computer keeps reactions, a
 * long-press on a message opens its reaction sheet (`remote.phone-reactions`).
 */
export function PhoneChat(props: PhoneChatProps) {
  const { messaging, conversation, agents, sources, computer, onOpenLink, onBack } = props;
  const [messages, setMessages] = useState<readonly Message[] | undefined>(undefined);
  const [to, setTo] = useState<readonly MessagingId[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [reads, setReads] = useState(0);
  const [failure, setFailure] = useState<ReadFailure | undefined>(undefined);
  const reactions = usePhoneReactions(messaging, conversation.id, reads);
  const [pressed, setPressed] = useState<Message | undefined>(undefined);

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

  const readAgain = () => {
    setFailure(undefined);
    setReads((count) => count + 1);
  };

  return (
    <div className="flex grow flex-col">
      <ChatHeader
        conversation={conversation}
        agents={agents}
        sources={sources}
        onBack={onBack}
        onMembers={() => setMembersOpen(true)}
      />
      <ReadFailedLine
        messaging={messaging}
        failure={failure}
        computer={computer}
        onTryAgain={readAgain}
      />
      {messages === undefined ? (
        <div className="flex-1">
          {failure === undefined ? (
            <ChatLoading label={words.loadingChat} onRetry={readAgain} />
          ) : null}
        </div>
      ) : (
        <ChatLines
          messages={messages}
          agents={agents}
          now={new Date()}
          reactions={reactions}
          onLongPress={setPressed}
          onOpenLink={onOpenLink}
        />
      )}
      <ChatBox
        {...props}
        reactionLine={reactions?.failed === true ? phoneReactionWords.notSaved : undefined}
        to={to}
        onTo={setTo}
        onSent={() => {
          setTo([]);
          setReads((count) => count + 1);
        }}
      />
      {pressed !== undefined && reactions !== undefined ? (
        <ReactionSheet
          body={pressed.body}
          author={authorName(pressed, agents)}
          reactions={reactions.byMessage.get(pressed.id) ?? []}
          onToggle={(emoji) => reactions.toggle(pressed.id, emoji)}
          onClose={() => setPressed(undefined)}
        />
      ) : null}
      {membersOpen ? (
        <MembersSheet
          conversation={conversation}
          agents={agents}
          computer={computer}
          onClose={() => setMembersOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** "@" and what follows it at the end of the text: what the picker filters the members by. */
const typedName = /(?:^|\s)@([^\s@]*)$/u;

/**
 * The kit's box under a chat. A message is sent once: after anything but the host taking it, the
 * text stays and the line under the box says why, and a send cut off by a drop is never sent
 * again. A box opened while its message is on its way says "Sending…" and takes the outcome.
 */
function ChatBox({
  conversation,
  agents,
  draft,
  onKeep,
  onSend,
  reactionLine,
  to,
  onTo,
  onSent,
}: PhoneChatProps & {
  /** A reaction that didn't save, said where the box says why a message didn't go. */
  readonly reactionLine: string | undefined;
  readonly to: readonly MessagingId[];
  readonly onTo: (to: readonly MessagingId[]) => void;
  readonly onSent: () => void;
}) {
  const lineId = useId();
  // The box keeps its own text, so a key redraws only the box, not every message above it.
  const [text, setText] = useState(draft.text);
  const [picking, setPicking] = useState(false);
  // The To line after a pick, for a screen reader: the tick is for the eye only (as MS10).
  const [toSaid, setToSaid] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const tooLong = text.length > gatewayMaxPromptLength;
  const channel = isChannel(conversation);
  useKeepOnClose(text, onKeep);
  // A message the computer takes while the box is open, sent from it or before it opened, empties it.
  useOnSent(draft.sent, () => {
    setText("");
    setToSaid("");
    onSent();
  });

  function send() {
    if (draft.sending || tooLong) return;
    void onSend(conversation, text, to);
  }

  function change(next: string) {
    setText(next);
    if (channel) setPicking(typedName.test(next));
  }

  const toLineOf = (named: readonly MessagingId[]) =>
    named.length > 0
      ? words.to(named.map((agent) => nameOf(agents, agent)))
      : words.toLead(nameOf(agents, conversation.agent));

  const toggle = (agent: MessagingId) => {
    const next = to.includes(agent) ? to.filter((each) => each !== agent) : [...to, agent];
    onTo(next);
    setToSaid(toLineOf(next));
    // A typed "@name" was only how the member was picked: it leaves the message.
    setText(text.replace(typedName, (typed) => (typed.startsWith("@") ? "" : (typed[0] ?? ""))));
    setPicking(false);
    textRef.current?.focus();
  };

  const query = typedName.exec(text)?.[1]?.toLocaleLowerCase() ?? "";
  const picker: ChatComposerPicker | undefined = channel
    ? {
        label: words.nameSomeone,
        open: picking,
        options: (conversation.members ?? [])
          .filter((agent) => nameOf(agents, agent).toLocaleLowerCase().startsWith(query))
          .map((agent) => ({
            id: agent,
            content: (
              <span
                className="flex min-w-0 flex-1 items-center gap-2"
                data-named={to.includes(agent)}
              >
                <span className="min-w-0 flex-1 truncate">{nameOf(agents, agent)}</span>
                {agent === conversation.agent ? (
                  <span className="text-small text-fg-muted">{words.lead}</span>
                ) : null}
                {to.includes(agent) ? (
                  <span
                    aria-hidden="true"
                    className="size-icon-md shrink-0 text-accent *:size-full"
                  >
                    <TickIcon />
                  </span>
                ) : null}
              </span>
            ),
          })),
        onPick: toggle,
        onClose: () => setPicking(false),
      }
    : undefined;

  const toLine = toLineOf(to);
  return (
    <div className="border-t border-border px-3 pt-2 pb-safe">
      <span role="status" className="sr-only">
        {toSaid}
      </span>
      <ChatComposer
        label={words.label}
        placeholder={words.placeholder(conversation.title)}
        value={text}
        onChange={change}
        onSend={send}
        onStop={() => {}}
        answering={false}
        sendUnavailable={tooLong ? { reason: lineId } : undefined}
        textRef={textRef}
        picker={picker}
        header={
          channel ? (
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-small text-fg-muted">{toLine}</span>
              <Button
                variant="ghost"
                size="sm"
                name={words.nameSomeone}
                onClick={() => setPicking((open) => !open)}
              >
                @
              </Button>
            </span>
          ) : undefined
        }
        line={boxLine(
          lineId,
          tooLong ? words.tooLong : (draft.line ?? reactionLine),
          draft.sending,
        )}
      />
    </div>
  );
}

/**
 * The line under the box: why a message didn't go, or "Sending…" while one is on its way, so a tap
 * on a slow link shows it did something.
 */
function boxLine(id: string, why: string | undefined, sending: boolean) {
  if (why !== undefined) {
    return (
      <span id={id}>
        <ChatBoxLine tone="warning">{why}</ChatBoxLine>
      </span>
    );
  }
  return sending ? <ChatBoxLine tone="muted">{words.sending}</ChatBoxLine> : undefined;
}

/** Gives `onKeep` what is in the box when the chat closes, read then, not when it opened. */
function useKeepOnClose(text: string, onKeep: (text: string) => void) {
  const latest = useRef({ text, onKeep });
  latest.current = { text, onKeep };
  useEffect(() => () => latest.current.onKeep(latest.current.text), []);
}

/** Calls `onSent` each time `sent` counts up after the box opened, not for sends before. */
function useOnSent(sent: number, onSent: () => void) {
  const seen = useRef(sent);
  const latest = useRef(onSent);
  latest.current = onSent;
  useEffect(() => {
    if (sent === seen.current) return;
    seen.current = sent;
    latest.current();
  }, [sent]);
}
