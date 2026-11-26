import type { Message, MessagingId } from "@halonicjs/ports";
import {
  AlertIcon,
  Button,
  EmptyState,
  ForwardIcon,
  PeopleIcon,
  RunningIcon,
  TickIcon,
  WarningIcon,
} from "@halonicjs/studio-kit";
import { type ReactNode, useState } from "react";
import { agentName, leadOf, memberName, type WorkLineKind, workLines } from "../channel.ts";
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

/**
 * Above the person's message in a channel, at its end side with the message: who it went to, "To
 * Elena and Liam", or "To Chief (lead)" when it named nobody (k10d, k11a). Nothing once the agents
 * it names, or that lead, left the source.
 */
export function MessageTo({
  message,
  row,
}: {
  readonly message: Message;
  readonly row: ConversationRow;
}) {
  if (message.author.kind !== "me") return null;
  const text = toText(message, row);
  if (text === undefined) return null;
  return (
    <p data-message-to className="text-end text-small text-fg-muted">
      {text}
    </p>
  );
}

function toText(message: Message, row: ConversationRow): string | undefined {
  const to = message.to ?? [];
  if (to.length > 0) {
    const names = to.flatMap((id) => agentName(row, id) ?? []);
    // Only agents the source no longer lists: no "To " with nothing after it.
    return names.length === 0 ? undefined : channelWords.to(names);
  }
  const lead = leadOf(row);
  return lead === undefined ? undefined : channelWords.toLeadSent(lead.name);
}

/** Each kind's kit icon and tone (k11b): the words carry the state, the icon only repeats it. */
const workIcons: Record<WorkLineKind, { readonly icon: ReactNode; readonly tone: string }> = {
  running: { icon: <RunningIcon />, tone: "text-running" },
  answered: { icon: <TickIcon />, tone: "text-success" },
  "asks-you": { icon: <AlertIcon />, tone: "text-warning" },
  failed: { icon: <AlertIcon />, tone: "text-danger" },
  "passed-on": { icon: <ForwardIcon />, tone: "text-fg-muted" },
  limit: { icon: <WarningIcon />, tone: "text-attention" },
};

/**
 * Under the person's message: one work line per agent it went to, a symbol and words each. A line
 * that ended without an answer has **Ask again**, which sends the message's text again to that
 * agent only; it is busy until the send is done, so a second press sends nothing more. `askAgain`
 * gives back why nothing was sent, or nothing once it was; that line follows the list.
 */
export function WorkLines({
  message,
  row,
  questions,
  now,
  askAgain,
}: {
  readonly message: Message;
  readonly row: ConversationRow;
  readonly questions: ReadonlyMap<MessagingId, string>;
  readonly now: Date;
  readonly askAgain: (message: Message, agent: MessagingId) => Promise<string | undefined>;
}) {
  const [notSent, setNotSent] = useState<string | undefined>(undefined);
  // Per agent, so one agent's send in flight leaves the other agents' Ask again ready.
  const [asking, setAsking] = useState<ReadonlySet<MessagingId>>(new Set());
  const lines = workLines(message, row, questions, now);
  if (lines.length === 0) return null;
  const ask = (agent: MessagingId) => {
    if (asking.has(agent)) return;
    setAsking((current) => new Set(current).add(agent));
    askAgain(message, agent)
      .then(setNotSent, (error: unknown) => console.error("Asking again failed:", error))
      .finally(() =>
        setAsking((current) => new Set([...current].filter((each) => each !== agent))),
      );
  };
  return (
    <>
      <ul data-work-lines className="mt-1 flex flex-col gap-0.5 text-small text-fg-muted">
        {lines.map((line, index) => (
          // Two hand-offs between the same agents read the same, so the place tells them apart.
          <li
            key={`${index}-${line.text}`}
            data-work={line.kind}
            className="flex items-center gap-1"
          >
            <span
              aria-hidden="true"
              className={`inline-grid size-icon-sm shrink-0 *:size-full ${workIcons[line.kind].tone}`}
            >
              {workIcons[line.kind].icon}
            </span>
            {line.text}
            {line.askAgain === undefined ? null : (
              <AskAgain agent={line.askAgain} busy={asking.has(line.askAgain)} onAsk={ask} />
            )}
          </li>
        ))}
      </ul>
      {notSent === undefined ? null : (
        <p role="alert" className="text-small text-danger">
          {notSent}
        </p>
      )}
    </>
  );
}

function AskAgain({
  agent,
  busy,
  onAsk,
}: {
  readonly agent: MessagingId;
  readonly busy: boolean;
  readonly onAsk: (agent: MessagingId) => void;
}) {
  return (
    <>
      <span aria-hidden="true"> · </span>
      <Button size="sm" variant="ghost" busy={busy} onClick={() => onAsk(agent)}>
        {channelWords.work.askAgain}
      </Button>
    </>
  );
}

/** A channel with no messages yet, on the group icon's tile: who answers when nobody is named. */
export function EmptyChannel({ row }: { readonly row: ConversationRow }) {
  const lead = leadOf(row);
  return (
    <li className="m-auto max-w-sm">
      <EmptyState
        icon={<PeopleIcon />}
        title={channelWords.empty}
        headingLevel={3}
        {...(lead === undefined ? {} : { description: channelWords.emptyHint(lead.name) })}
      />
    </li>
  );
}
