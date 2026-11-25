import type { Message, MessagingId } from "@halonicjs/ports";
import { agentName, leadOf, memberName, workLines } from "../channel.ts";
import { channelWords } from "../channel-words.ts";
import type { ConversationRow } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";

/**
 * Who wrote a message, as the source says (requirement `messenger.author-from-source`): "You" only
 * for the person's own, and for an agent the name its source lists for that agent, never a name
 * in the message's text. In a channel, where several agents write, it shows above each message.
 */
export function authorOf(message: Message, row: ConversationRow): string {
  const { author } = message;
  if (author.kind === "me") return messengerWords.you;
  if (author.kind === "person") return author.name;
  return memberName(row, author.agent);
}

/** Above the person's message in a channel: who it went to, "To Elena and Liam". */
export function MessageTo({
  message,
  row,
}: {
  readonly message: Message;
  readonly row: ConversationRow;
}) {
  const names = (message.to ?? []).flatMap((id) => agentName(row, id) ?? []);
  // Nobody named, or only agents the source no longer lists: no "To " with nothing after it.
  if (names.length === 0) return null;
  return <p className="text-small text-fg-muted">{channelWords.to(names)}</p>;
}

/** Under the person's message: one work line per agent it went to, a symbol and words each. */
export function WorkLines({
  message,
  row,
  questions,
  now,
}: {
  readonly message: Message;
  readonly row: ConversationRow;
  readonly questions: ReadonlyMap<MessagingId, string>;
  readonly now: Date;
}) {
  const lines = workLines(message, row, questions, now);
  if (lines.length === 0) return null;
  return (
    <ul data-work-lines className="mt-1 flex flex-col gap-0.5 text-small text-fg-muted">
      {lines.map((line, index) => (
        // Two hand-offs between the same agents read the same, so the place tells them apart.
        <li key={`${index}-${line.text}`}>
          {/* The words carry the state; the symbol only repeats it. */}
          <span aria-hidden="true">{line.symbol} </span>
          {line.text}
        </li>
      ))}
    </ul>
  );
}

/** A channel with no messages yet: who answers when the person names nobody. */
export function EmptyChannel({ row }: { readonly row: ConversationRow }) {
  const lead = leadOf(row);
  return (
    <li className="m-auto max-w-sm text-center">
      <p className="text-body-strong">{channelWords.empty}</p>
      {lead === undefined ? null : (
        <p className="text-small text-fg-muted">{channelWords.emptyHint(lead.name)}</p>
      )}
    </li>
  );
}
