import type {
  InboxItem as AgentItem,
  AnswerResult,
  AttachmentRead,
  InboxAnswer,
  InboxQuestionsAnswer,
  MessagingAgent,
  MessagingAuthor,
  MessagingId,
  MessagingSource,
  WorkItem,
} from "@halonicjs/ports";
import { Avatar, Button, Callout, QuestionForm, waitingSince } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import {
  agentItemTitle,
  answeredLine,
  answerText,
  askerLine,
  questionIsTitle,
  sourceDownLine,
  workLine,
} from "../agent/agent-item-text.ts";
import { AgentAttachments } from "./agent-attachments.tsx";
import { AgentMarkdown } from "./agent-markdown.tsx";
import {
  CardHeader,
  cardBodyClasses,
  cardClasses,
  FailedLine,
  failureDetailOf,
  useEveryMinute,
} from "./card-parts.tsx";
import { OptionButtons } from "./option-buttons.tsx";

/** Props for {@link AgentItemCard}. */
export interface AgentItemCardProps {
  /** The item as last read, so it turns answered when another client answers it. */
  readonly item: AgentItem;
  readonly source: MessagingSource | undefined;
  /** The work it came from, when the source names one and has it. */
  readonly work?: WorkItem | undefined;
  /** The sources' agents, so the card says who asks with their title; without them, the name alone. */
  readonly agents?: readonly MessagingAgent[] | undefined;
  readonly now: () => Date;
  readonly answer: (answer: InboxAnswer) => Promise<AnswerResult>;
  /** Reads one of its files through the engine, only when the person asks to see it. */
  readonly readAttachment: (attachment: MessagingId) => Promise<AttachmentRead>;
  /** Whether its title takes the focus when it opens: in a bundle, only the first card's does. */
  readonly focusOnOpen?: boolean;
  /**
   * For an action item whose request Halonic can't read: why, one reason each. The card then says
   * so and offers only **Decline** (`inbox.agent-action-items`).
   */
  readonly cannotRun?: readonly string[];
}

/** How an action request ends when the user declines it: it never ran, so no step is listed. */
const declined: InboxAnswer = { kind: "action-result", outcome: "declined", steps: [] };

/** Where this card's own answer is. */
type Sent =
  | { readonly kind: "idle" }
  | { readonly kind: "sending"; readonly answer: InboxAnswer }
  | { readonly kind: "failed"; readonly answer: InboxAnswer; readonly error?: unknown }
  | { readonly kind: "answered"; readonly answer: InboxAnswer; readonly answeredAt: string }
  | { readonly kind: "elsewhere"; readonly by: MessagingAuthor; readonly answeredAt: string };

/**
 * An agent's card or question (`inbox.agent-inbox-items`): its title, its source and since when it
 * waits, the question as safe Markdown, and one button per option, with a field for an option that
 * takes a note (`inbox.option-note`), a form of its questions when it asks several
 * (`inbox.question-cards`), or a reply field when it has none. Once answered, here or elsewhere, a
 * line says by whom and how, and the buttons stay, off (render 5f). It names the work it came
 * from, whatever made it (`inbox.every-waiting-item`), and
 * lists its files, showing a picture only once asked (`inbox.agent-item-media`). While its source
 * is offline or signed out the buttons are off and say why; nothing is kept to send later.
 */
export function AgentItemCard({
  item,
  source,
  work,
  agents = [],
  now,
  answer,
  readAttachment,
  focusOnOpen = true,
  cannotRun = [],
}: AgentItemCardProps) {
  useEveryMinute();
  const titleId = useId();
  const reasonId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnOpen) heading.current?.focus({ preventScroll: true });
  }, [focusOnOpen]);
  const [sent, setSent] = useState<Sent>({ kind: "idle" });
  const send = async (chosen: InboxAnswer) => {
    setSent({ kind: "sending", answer: chosen });
    try {
      const result = await answer(chosen);
      setSent(sentAfter(result, chosen));
    } catch (error) {
      // The line below says it failed, with the failure's own reason, and Try again sends the same answer.
      setSent({ kind: "failed", answer: chosen, error });
    }
  };

  const decided = decidedLine(item, sent);
  const down = decided === null ? sourceDownLine(source, now()) : null;
  const reason = decided ?? down;
  const unavailable = reason === null ? undefined : { reason: reasonId };
  const busy = (chosen: InboxAnswer) =>
    sent.kind === "sending" && JSON.stringify(sent.answer) === JSON.stringify(chosen);
  const since = item.state.kind === "open" ? waitingSince(new Date(item.createdAt), now()) : null;
  const label = source?.label;

  return (
    <section aria-labelledby={titleId} className={cardClasses}>
      <div className={cardBodyClasses}>
        <Asker from={item.from} agents={agents} />
        <CardHeader
          titleId={titleId}
          title={agentItemTitle(item)}
          heading={heading}
          since={[label, since].filter((part) => part != null).join(" · ")}
        />
        {work === undefined ? null : <p className="text-small text-fg-muted">{workLine(work)}</p>}
        {questionIsTitle(item) ? null : <AgentMarkdown text={item.question} />}
        <AgentAttachments attachments={item.attachments} read={readAttachment} />
      </div>
      <div className="flex flex-col gap-3 border-t border-border p-4">
        {decided === null ? null : (
          <Callout tone="info" announce="polite">
            <span id={reasonId}>{decided}</span>
          </Callout>
        )}
        {down === null ? null : (
          <p id={reasonId} className="text-small text-fg-muted">
            {down}
          </p>
        )}
        <FailedLine
          onRetry={sent.kind === "failed" ? () => void send(sent.answer) : null}
          detail={sent.kind === "failed" ? failureDetailOf(sent.error) : null}
        />
        {item.action === undefined ? null : (
          <CannotRun
            reasons={cannotRun}
            unavailable={unavailable}
            busy={busy(declined)}
            onDecline={() => void send(declined)}
          />
        )}
        <AnswerControls
          item={item}
          sent={sent}
          unavailable={unavailable}
          answeredReason={reasonId}
          busy={busy}
          send={(chosen) => void send(chosen)}
        />
      </div>
    </section>
  );
}

interface AnswerControlsProps {
  readonly item: AgentItem;
  readonly sent: Sent;
  readonly unavailable: { readonly reason: string } | undefined;
  /** The `id` of the callout that says how the item was answered. */
  readonly answeredReason: string;
  readonly busy: (chosen: InboxAnswer) => boolean;
  readonly send: (chosen: InboxAnswer) => void;
}

/**
 * How the person answers an item that isn't an action request: a form of its questions when it
 * asks several (`inbox.question-cards`), else a button per option with any note fields
 * (`inbox.option-note`), else a written reply.
 */
function AnswerControls({
  item,
  sent,
  unavailable,
  answeredReason,
  busy,
  send,
}: AnswerControlsProps) {
  const [reply, setReply] = useState("");
  if (item.action !== undefined) return null;
  if (item.questions !== undefined) {
    return (
      <QuestionForm
        questions={item.questions}
        answered={answeredWith(item, sent, answeredReason)}
        busy={sent.kind === "sending"}
        unavailable={unavailable}
        onSubmit={(answers) => send({ kind: "answers", answers })}
      />
    );
  }
  if (item.options.length === 0) {
    return (
      <ReplyField
        value={reply}
        onChange={setReply}
        unavailable={unavailable}
        busy={busy({ kind: "reply", text: reply })}
        onSend={() => send({ kind: "reply", text: reply })}
      />
    );
  }
  return (
    <OptionButtons options={item.options} unavailable={unavailable} busy={busy} onAnswer={send} />
  );
}

/** Who asks, with their picture, over the title; nothing for an item you wrote yourself. */
function Asker({
  from,
  agents,
}: {
  readonly from: MessagingAuthor;
  readonly agents: readonly MessagingAgent[];
}) {
  if (from.kind === "me") return null;
  return (
    <p className="flex items-center gap-2 text-small text-fg-muted">
      <Avatar name={from.name} />
      {askerLine(from, agents)}
    </p>
  );
}

function sentAfter(result: AnswerResult, chosen: InboxAnswer): Sent {
  switch (result.outcome) {
    case "answered":
      return { kind: "answered", answer: chosen, answeredAt: result.answeredAt };
    case "already-answered":
      return { kind: "elsewhere", by: result.by, answeredAt: result.answeredAt };
    case "refused":
      // Offline or signed out, the source's own line says so once it is read again; an item
      // that is gone can't be answered, so it is a failure to try again.
      return result.reason === "not-found" ? { kind: "failed", answer: chosen } : { kind: "idle" };
  }
}

/**
 * What a card that asks several questions was answered with, by this card or as the source last
 * said. `reason` is the card's own answered line, which then stands in for the form's (render 5f).
 */
function answeredWith(
  item: AgentItem,
  sent: Sent,
  reason: string,
):
  | {
      readonly answers: InboxQuestionsAnswer["answers"];
      readonly at: Date;
      readonly reason: string;
    }
  | undefined {
  if (sent.kind === "answered" && sent.answer.kind === "answers") {
    return { answers: sent.answer.answers, at: new Date(sent.answeredAt), reason };
  }
  if (item.state.kind === "answered" && item.state.answer.kind === "answers") {
    return { answers: item.state.answer.answers, at: new Date(item.state.answeredAt), reason };
  }
  return undefined;
}

/** The line once the item is answered: by this card, else as the source last said, else as the refusal said. */
function decidedLine(item: AgentItem, sent: Sent): string | null {
  if (sent.kind === "answered") {
    return answeredLine(true, { kind: "me" }, sent.answeredAt, answerText(item, sent.answer));
  }
  if (item.state.kind === "answered") {
    const { by, answeredAt, answer } = item.state;
    return answeredLine(false, by, answeredAt, answerText(item, answer));
  }
  return sent.kind === "elsewhere"
    ? answeredLine(false, sent.by, sent.answeredAt, undefined)
    : null;
}

interface CannotRunProps {
  readonly reasons: readonly string[];
  readonly unavailable: { readonly reason: string } | undefined;
  readonly busy: boolean;
  readonly onDecline: () => void;
}

/**
 * An action request Halonic can't read: the reasons as plain text, never Markdown, and **Decline**,
 * so the agent hears it won't run. Nothing here can run it. Without reasons it shows nothing.
 */
function CannotRun({ reasons, unavailable, busy, onDecline }: CannotRunProps) {
  if (reasons.length === 0) return null;
  return (
    <>
      <Callout tone="attention" title="This card has a stepper Halonic can't read:">
        <ul className="list-disc pl-5">
          {reasons.map((reason) => (
            <li key={reason} className="wrap-break-word">
              <QuotedAsCode text={reason} />
            </li>
          ))}
        </ul>
      </Callout>
      <div>
        <Button variant="secondary" unavailable={unavailable} busy={busy} onClick={onDecline}>
          Decline
        </Button>
      </div>
    </>
  );
}

/**
 * A reason with what the validator quotes in backticks (a stepper's name, an address) set in code
 * type, without the backticks. Nothing else is read as Markdown. A stray backtick with no partner
 * leaves the whole reason as it came.
 */
function QuotedAsCode({ text }: { readonly text: string }) {
  const parts = text.split("`");
  const balanced = parts.length % 2 === 1;
  if (!balanced) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <code key={index} className="font-mono text-code">
        {part}
      </code>
    ) : (
      part
    ),
  );
}

interface ReplyFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly unavailable: { readonly reason: string } | undefined;
  readonly busy: boolean;
  readonly onSend: () => void;
}

/** Why **Send answer** is off while the field is empty (a11y IN2, HAL-18073). */
export const emptyAnswerHint = "Write an answer to send it.";

/** A question with no options takes a written answer. */
function ReplyField({ value, onChange, unavailable, busy, onSend }: ReplyFieldProps) {
  const fieldId = useId();
  const hintId = useId();
  const empty = value.trim() === "";
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-small text-fg-muted">
        Your answer
      </label>
      <textarea
        id={fieldId}
        value={value}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring rounded-sm border border-border bg-surface px-3 py-2 text-body text-fg"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          unavailable={unavailable ?? (empty ? { reason: hintId } : undefined)}
          busy={busy}
          onClick={onSend}
        >
          Send answer
        </Button>
        {unavailable === undefined && empty ? (
          <p id={hintId} className="text-small text-fg-muted">
            {emptyAnswerHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
