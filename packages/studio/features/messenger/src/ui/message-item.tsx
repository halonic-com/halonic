import type { Message, MessagingId } from "@halonicjs/ports";
import {
  Avatar,
  ChatText,
  decidedAt,
  SparkIcon,
  Tooltip,
  useOpenExternal,
} from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { isChannel } from "../channel.ts";
import type { PendingMessage } from "../chat-layout.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { AttachmentList } from "./attachment-list.tsx";
import { authorOf, MessageTo, WorkLines } from "./channel-message.tsx";

/**
 * One message (`messenger.chat-transcript`). The person's sits on the end side in a bubble with
 * its time under it. An agent's sits on the start side in a bubble of its own, and starts its run
 * with the picture and "Name · 13:58" when `head`; the rest of the run lines up under the name
 * (`messenger.agent-bubbles`). An automatic note, such as a fast-response receipt, has a dashed
 * edge and a small mark (`messenger.automatic-notes`). `data-head` and `data-follows` let the transcript
 * set a run's messages close together and a new run further apart. Each says who wrote it to a screen reader; in a
 * channel the person's say who they went to and what each agent did with them
 * (`messenger.channel-messages`).
 */
export function MessageItem({
  messenger,
  row,
  message,
  head,
  follows,
  picture,
  questions,
}: {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  readonly message: Message;
  readonly head: boolean;
  /** It goes on the run of the message before it. */
  readonly follows: boolean;
  /** The chat agent's picture; a channel's members show their initials. */
  readonly picture: ImageBitmap | undefined;
  readonly questions: ReadonlyMap<MessagingId, string>;
}) {
  const openLink = useOpenExternal();
  const channel = isChannel(row);
  const author = authorOf(message, row);
  const body = (
    <>
      <span className="sr-only">{author}: </span>
      <ChatText openLink={openLink}>{message.body}</ChatText>
      <AttachmentList messenger={messenger} attachments={message.attachments} />
    </>
  );
  const time = decidedAt(new Date(message.sentAt));
  if (message.author.kind === "me") {
    return (
      <Bubble
        data={{ "data-author": "me", ...runData(false, follows) }}
        under={time}
        above={channel ? <MessageTo message={message} row={row} /> : null}
        after={
          channel ? (
            <WorkLines message={message} row={row} questions={questions} now={messenger.now()} />
          ) : null
        }
      >
        {body}
      </Bubble>
    );
  }
  const automatic = message.automatic === true;
  return (
    <li
      data-author={message.author.kind}
      {...(automatic ? { "data-automatic": "" } : {})}
      {...runData(head, follows)}
      className="max-w-[80%]"
    >
      {head ? (
        // The sr-only "<name>: " says it, so a screen reader reads it once (MS11).
        <p aria-hidden="true" className="flex items-center gap-2 text-small text-fg-muted">
          <Avatar name={author} picture={channel ? undefined : picture} />
          <span>
            <bdi data-author-name aria-hidden="true">
              {author}
            </bdi>{" "}
            · {time}
          </span>
        </p>
      ) : null}
      <div className="flex items-start gap-1.5 ps-9">
        <div data-bubble className={agentBubble(automatic)}>
          {automatic ? <span className="sr-only">{messengerWords.automatic(author)} </span> : null}
          {body}
        </div>
        {automatic ? <AutomaticMark author={author} /> : null}
      </div>
    </li>
  );
}

/**
 * An agent's bubble on the start side, on a neutral surface with an edge (plan HAL-18743, sketch
 * 3.1). An automatic note has a dashed edge and no fill, so it reads lighter than the agent's
 * answer (sketch 3.2).
 */
function agentBubble(automatic: boolean): string {
  const look = automatic ? "border-dashed border-border-strong" : "border-border bg-surface-subtle";
  return `min-w-0 rounded-lg border px-3 py-2 wrap-break-word ${look}`;
}

/** The small mark beside an automatic note; its tooltip says who wrote it. */
function AutomaticMark({ author }: { readonly author: string }) {
  return (
    // The note's sr-only line already says it, so the tooltip is for the eye only.
    <Tooltip text={messengerWords.automatic(author)} visualOnly>
      {() => (
        <span data-automatic-mark className="mt-3 size-3 shrink-0 text-fg-muted">
          <SparkIcon />
        </span>
      )}
    </Tooltip>
  );
}

/**
 * The person's message still on its way, with the names of its files: at full strength, "Sending…"
 * where its time goes.
 */
export function PendingItem({
  pending,
  follows,
}: {
  readonly pending: PendingMessage;
  /** It goes on a run of the person's messages. */
  readonly follows: boolean;
}) {
  const openLink = useOpenExternal();
  return (
    <Bubble
      data={{ "data-pending": "", ...runData(false, follows) }}
      under={messengerWords.sending}
    >
      <span className="sr-only">{messengerWords.you}: </span>
      <ChatText openLink={openLink}>{pending.body}</ChatText>
      {(pending.files ?? []).length === 0 ? null : (
        // The names only, as the sent message's file lines start; two files may share a name.
        <ul className="mt-2 flex flex-col gap-2 text-small">
          {(pending.files ?? []).map((name, index) => (
            <li key={index}>
              <bdi>{name}</bdi>
            </li>
          ))}
        </ul>
      )}
    </Bubble>
  );
}

/** Where a message stands in its run, for the transcript's spacing. */
function runData(head: boolean, follows: boolean): Record<string, string> {
  if (head) return { "data-head": "" };
  return follows ? { "data-follows": "" } : {};
}

/** "Today", "Yesterday" or "Mon 23 Nov" before a day's first entry. */
export function DayItem({ label }: { readonly label: string }) {
  return (
    <li data-day className="text-center text-small text-fg-muted">
      {label}
    </li>
  );
}

function Bubble({
  data,
  under,
  above,
  after,
  children,
}: {
  readonly data: Record<string, string>;
  /** The muted line under the bubble: the time, or "Sending…". */
  readonly under: string;
  /** In a channel, who the message went to. */
  readonly above?: ReactNode;
  /** In a channel, what each agent did with it. */
  readonly after?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <li {...data} className="ms-auto flex max-w-[80%] flex-col items-end gap-1">
      {above}
      <div className="rounded-lg bg-surface-muted px-3 py-2 wrap-break-word">{children}</div>
      <p className="text-small text-fg-muted">{under}</p>
      {after}
    </li>
  );
}
