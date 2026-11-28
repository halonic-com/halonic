import type { Conversation, Message, MessagingId } from "@halonicjs/ports";
import {
  Avatar,
  agentTint,
  BackIcon,
  Button,
  ChatMessage,
  SheetFrame,
} from "@halonicjs/studio-kit";
import { Fragment, useEffect, useRef } from "react";
import { messageParts, openChecked } from "./message-links.ts";
import type { ChatAgents, SourceLabels } from "./phone-messenger.tsx";
import { dayLabel, phoneMessengerWords as words } from "./phone-messenger-words.ts";

/** A channel has members; a direct chat has none. */
export function isChannel(conversation: Conversation): boolean {
  return conversation.members !== undefined;
}

/** An agent's name, or its id while the agents read hasn't named it. */
export function nameOf(agents: ChatAgents, agent: MessagingId): string {
  return agents.get(agent)?.name ?? agent;
}

/**
 * The line under a chat's name (p04a): "Paperclip · Halonic · Working" for a direct chat, its
 * source and its agent's activity, or "Chief (lead) · Liam · Elena" for a channel (group 15).
 */
export function statusLine(
  conversation: Conversation,
  agents: ChatAgents,
  sources: SourceLabels,
): string {
  if (conversation.members !== undefined) {
    return conversation.members
      .map((agent) =>
        agent === conversation.agent
          ? words.leadName(nameOf(agents, agent))
          : nameOf(agents, agent),
      )
      .join(" · ");
  }
  const activity = agents.get(conversation.agent)?.activity;
  return [sources.get(conversation.source), activity === undefined ? "" : words.activity[activity]]
    .filter((part) => part !== undefined && part !== "")
    .join(" · ");
}

/** A chat's header (p04a): Back, the agent's picture, the name over its status line, Members. */
export function ChatHeader({
  conversation,
  agents,
  sources,
  onBack,
  onMembers,
}: {
  readonly conversation: Conversation;
  readonly agents: ChatAgents;
  readonly sources: SourceLabels;
  readonly onBack: () => void;
  readonly onMembers: () => void;
}) {
  const channel = isChannel(conversation);
  const status = statusLine(conversation, agents, sources);
  // The chat opens in the list's place, so focus starts on its name, not the page (WCAG 2.4.3).
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <header className="flex min-h-14 items-center gap-2 border-b border-border px-2 py-1">
      <Button
        variant="ghost"
        size="touch"
        icon={<BackIcon />}
        label={words.back}
        onClick={onBack}
      />
      <Avatar
        name={channel ? conversation.title : nameOf(agents, conversation.agent)}
        tint={channel ? undefined : agentTint(conversation.agent)}
        size="header"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 ref={titleRef} tabIndex={-1} className="truncate text-heading text-fg focus-ring">
          {conversation.title}
        </h2>
        {status === "" ? null : <p className="truncate text-small text-fg-muted">{status}</p>}
      </div>
      {channel ? (
        <Button variant="ghost" size="touch" onClick={onMembers}>
          {words.members}
        </Button>
      ) : null}
    </header>
  );
}

/**
 * A chat's messages, oldest first, with a day line ("Today") before each day's first (p04a). The
 * person's own sit on the right in the kit's `surface-muted` box; a reply takes the full width
 * under its author's picture and name, which is also its heading for a screen reader, so in a
 * channel each says who wrote it.
 */
export function ChatLines({
  messages,
  agents,
  now,
  onOpenLink,
}: {
  readonly messages: readonly Message[];
  readonly agents: ChatAgents;
  readonly now: Date;
  readonly onOpenLink: (link: string) => void;
}) {
  let day = "";
  return (
    <ol className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {messages.map((message) => {
        const label = dayLabel(new Date(message.sentAt), now);
        const newDay = label !== day;
        day = label;
        return (
          <Fragment key={message.id}>
            {newDay ? (
              <li data-day className="text-center text-small text-fg-muted">
                {label}
              </li>
            ) : null}
            <li data-message-id={message.id}>
              <Line message={message} agents={agents} onOpenLink={onOpenLink} />
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function Line({
  message,
  agents,
  onOpenLink,
}: {
  readonly message: Message;
  readonly agents: ChatAgents;
  readonly onOpenLink: (link: string) => void;
}) {
  const { author } = message;
  if (author.kind === "me") {
    return (
      <ChatMessage from="you">
        {/* The box on the right says whose it is to the eye only; this says it to a screen reader. */}
        <span className="sr-only">{words.you}</span>
        <MessageBody body={message.body} onOpenLink={onOpenLink} />
      </ChatMessage>
    );
  }
  const name = author.kind === "agent" ? nameOf(agents, author.agent) : author.name;
  return (
    <ChatMessage from="reply" heading={name}>
      {/* The heading says the name to a screen reader, so this line is for the eye only. */}
      <div aria-hidden="true" className="flex items-center gap-2">
        <Avatar name={name} tint={agentTint(author.kind === "agent" ? author.agent : name)} />
        <span className="text-small font-semibold text-fg">{name}</span>
      </div>
      <p className="text-reading text-fg whitespace-pre-wrap wrap-break-word">
        <MessageBody body={message.body} onOpenLink={onOpenLink} />
      </p>
    </ChatMessage>
  );
}

/** A message's text, its links showing their full address (`messageParts`). */
function MessageBody({
  body,
  onOpenLink,
}: {
  readonly body: string;
  readonly onOpenLink: (link: string) => void;
}) {
  return messageParts(body).map((part, index) =>
    part.kind === "text" ? (
      // Parts never reorder, so the index is the key.
      <span key={index}>{part.text}</span>
    ) : (
      // A real link, so a screen reader says "Link"; the tap goes through `openChecked`.
      <a
        key={index}
        href={part.link}
        className="break-all text-accent-text underline focus-ring"
        onClick={(event) => {
          event.preventDefault();
          openChecked(part.link, undefined, onOpenLink);
        }}
      >
        {part.link}
        <span className="sr-only">{words.opensInBrowser}</span>
      </a>
    ),
  );
}

/**
 * Members (k16c), on the kit's phone sheet: who is in the channel, its lead marked, read-only,
 * since changing who is in a channel stays on the computer.
 */
export function MembersSheet({
  conversation,
  agents,
  computer,
  onClose,
}: {
  readonly conversation: Conversation;
  readonly agents: ChatAgents;
  readonly computer: string;
  readonly onClose: () => void;
}) {
  return (
    <SheetFrame title={words.members} onClose={onClose} onCancel={onClose}>
      <ul className="flex flex-col">
        {(conversation.members ?? []).map((agent) => (
          <li
            key={agent}
            className="flex min-h-touch items-center gap-3 border-b border-border px-4 py-2 text-body text-fg"
          >
            <Avatar name={nameOf(agents, agent)} tint={agentTint(agent)} />
            <span className="min-w-0 flex-1 truncate">{nameOf(agents, agent)}</span>
            {agent === conversation.agent ? (
              <span className="text-small text-fg-muted">{words.lead}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="px-4 pt-4 text-small text-fg-muted">{words.membersOnComputer(computer)}</p>
    </SheetFrame>
  );
}

/** Whether a read's item has a message's id, body and author: the rest the chat doesn't use. */
export function isMessage(item: unknown): item is Message {
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
