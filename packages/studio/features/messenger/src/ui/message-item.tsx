import type { Message, MessagingId } from "@halonicjs/ports";
import {
  type AgentTint,
  AuthorLine,
  ChatText,
  decidedAt,
  SparkIcon,
  Tooltip,
  useOpenExternal,
} from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { agentTint } from "../agent-tint.ts";
import { isChannel } from "../channel.ts";
import type { PendingMessage } from "../chat-layout.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { AttachmentList } from "./attachment-list.tsx";
import { authorOf, MessageTo, WorkLines } from "./channel-message.tsx";
import { ReadTicks } from "./read-ticks.tsx";

/**
 * One message (`messenger.chat-transcript`). The person's sits on the end side in a bubble with
 * its time under it; in a chat it has one tick once sent and two once the agent picked it up
 * (`messenger.read-receipts`). An agent's sits on the start side in a bubble of its own, and starts
 * its run with the picture and "Name · 13:58" when `head`; the rest of the run lines up under the name
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
  found,
  onAsked,
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
  /** The find bar found it: the match shown, or another (`messenger.find-in-chat`). */
  readonly found?: "current" | "match" | undefined;
  /** **Ask again** sent the message again: the chat reads its messages again. */
  readonly onAsked: () => Promise<void>;
}) {
  const mark = foundData(message.id, found);
  const openLink = useOpenExternal();
  const channel = isChannel(row);
  const author = authorOf(message, row);
  const body = (
    <>
      <span className="sr-only">{author}: </span>
      {message.plainText === true ? (
        // Shown as written: never read as Markdown, so nothing in it becomes a link or styling.
        <p data-plain-text dir="auto" className="whitespace-pre-line text-reading text-fg">
          {message.body}
        </p>
      ) : (
        <ChatText openLink={openLink}>{message.body}</ChatText>
      )}
      <AttachmentList messenger={messenger} attachments={message.attachments} />
    </>
  );
  const time = decidedAt(new Date(message.sentAt));
  if (message.author.kind === "me") {
    return (
      <Bubble
        data={{ "data-author": "me", ...mark, ...runData(false, follows) }}
        under={
          channel ? (
            time
          ) : (
            // A channel's work lines say what each agent did with it; a chat has ticks.
            <span className="inline-flex items-center gap-1">
              {time}
              <ReadTicks message={message} />
            </span>
          )
        }
        above={channel ? <MessageTo message={message} row={row} /> : null}
        after={
          channel ? (
            <WorkLines
              message={message}
              row={row}
              questions={questions}
              now={messenger.now()}
              askAgain={async (asked, agent) => {
                const result = await messenger.askAgain(row, asked, agent);
                if (result.outcome === "refused") {
                  return messengerWords.notSent[result.reason](row.source?.label ?? "");
                }
                await onAsked();
                return undefined;
              }}
            />
          ) : null
        }
      >
        {body}
      </Bubble>
    );
  }
  const automatic = message.automatic === true;
  const tint = agentTint(message.author);
  return (
    <li
      data-author={message.author.kind}
      {...mark}
      {...(automatic ? { "data-automatic": "" } : {})}
      {...runData(head, follows)}
      className={`max-w-[80%] ${foundRing}`}
    >
      {head ? (
        // The sr-only "<name>: " says it, so a screen reader reads it once (MS11). The name in the
        // normal text colour, the time muted (HAL-19132, point 4), on the agent's own tint.
        <AuthorLine
          name={author}
          time={time}
          picture={channel ? undefined : picture}
          tint={tint}
          visualOnly
        />
      ) : null}
      <div className="flex items-start gap-2 ps-9">
        <div data-bubble className={agentBubble(automatic, tint)}>
          {automatic ? <span className="sr-only">{messengerWords.automatic(author)} </span> : null}
          {body}
        </div>
        {automatic ? <AutomaticMark author={author} /> : null}
      </div>
    </li>
  );
}

/**
 * An agent's bubble on the start side, with no visible edge, in the agent's own tint at the
 * strength of the person's bubble (HAL-19134, approved on HAL-19132). The edge is transparent rather
 * than absent: forced-colours mode drops the tint and paints that edge, so the bubble keeps its
 * shape there. An automatic note keeps its dashed edge and no fill, so it reads lighter than the
 * agent's answer (plan HAL-18743, sketch 3.2).
 */
function agentBubble(automatic: boolean, tint: AgentTint): string {
  const look = automatic
    ? "border border-dashed border-border-strong"
    : `border border-transparent ${tint}`;
  return `min-w-0 rounded-lg px-3 py-2 wrap-break-word ${look}`;
}

/** The small mark beside an automatic note; its tooltip says who wrote it. */
function AutomaticMark({ author }: { readonly author: string }) {
  return (
    // The note's sr-only line already says it, so the tooltip is for the eye only.
    <Tooltip text={messengerWords.automatic(author)} visualOnly>
      {() => (
        <span data-automatic-mark className="mt-3.5 size-3 shrink-0 text-fg-muted">
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

/**
 * A message's ID, for the find bar to scroll to it, and what the find bar found: the bubble of the
 * match shown gets the accent ring, any other match a quiet one.
 */
function foundData(
  id: MessagingId,
  found: "current" | "match" | undefined,
): Record<string, string> {
  return found === undefined ? { "data-message": id } : { "data-message": id, "data-found": found };
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

/** The ring on a found message's bubble, set by the `data-found` its line carries. */
const foundRing =
  "[&[data-found=current]_[data-bubble]]:ring-2 [&[data-found=current]_[data-bubble]]:ring-accent [&[data-found=match]_[data-bubble]]:ring-1 [&[data-found=match]_[data-bubble]]:ring-border-strong";

function Bubble({
  data,
  under,
  above,
  after,
  children,
}: {
  readonly data: Record<string, string>;
  /** The muted line under the bubble: the time and its ticks, or "Sending…". */
  readonly under: ReactNode;
  /** In a channel, who the message went to. */
  readonly above?: ReactNode;
  /** In a channel, what each agent did with it. */
  readonly after?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <li {...data} className={`ms-auto flex max-w-[80%] flex-col items-end gap-1 ${foundRing}`}>
      {above}
      <div data-bubble className="rounded-lg bg-surface-muted px-3 py-2 wrap-break-word">
        {children}
      </div>
      {/* A div: the ticks' tooltip is one. */}
      <div className="text-small text-fg-muted">{under}</div>
      {after}
    </li>
  );
}
