import type {
  InboxItem as AgentItem,
  AnswerResult,
  InboxAnswer,
  MessagingAuthor,
  MessagingSource,
} from "@halonicjs/ports";
import { Button, Callout } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import {
  agentItemTitle,
  answeredLine,
  answerText,
  sourceDownLine,
} from "../agent/agent-item-text.ts";
import { waitingSince } from "../plain/waiting-time.ts";
import { AgentMarkdown } from "./agent-markdown.tsx";
import {
  CardHeader,
  cardBodyClasses,
  cardClasses,
  FailedLine,
  failureDetailOf,
  useEveryMinute,
} from "./card-parts.tsx";

/** Props for {@link AgentItemCard}. */
export interface AgentItemCardProps {
  /** The item as last read, so it turns answered when another client answers it. */
  readonly item: AgentItem;
  readonly source: MessagingSource | undefined;
  readonly now: () => Date;
  readonly answer: (answer: InboxAnswer) => Promise<AnswerResult>;
}

/** Where this card's own answer is. */
type Sent =
  | { readonly kind: "idle" }
  | { readonly kind: "sending"; readonly answer: InboxAnswer }
  | { readonly kind: "failed"; readonly answer: InboxAnswer; readonly error?: unknown }
  | { readonly kind: "answered"; readonly answer: InboxAnswer; readonly answeredAt: string }
  | { readonly kind: "elsewhere"; readonly by: MessagingAuthor; readonly answeredAt: string };

/**
 * An agent's card or question (`inbox.agent-inbox-items`): its title, its source and since when it
 * waits, the question as safe Markdown, and one button per option, or a reply field when it has
 * none. Once answered, here or elsewhere, a line says by whom and how, and the buttons stay, off
 * (render 5f). While its source is offline or signed out the buttons are off and say why; nothing
 * is kept to send later.
 */
export function AgentItemCard({ item, source, now, answer }: AgentItemCardProps) {
  useEveryMinute();
  const titleId = useId();
  const reasonId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const [sent, setSent] = useState<Sent>({ kind: "idle" });
  const [reply, setReply] = useState("");

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
        <CardHeader
          titleId={titleId}
          title={agentItemTitle(item)}
          heading={heading}
          since={[label, since].filter((part) => part != null).join(" · ")}
        />
        <AgentMarkdown text={item.question} />
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
        {item.options.length === 0 ? (
          <ReplyField
            value={reply}
            onChange={setReply}
            unavailable={unavailable}
            busy={busy({ kind: "reply", text: reply })}
            onSend={() => void send({ kind: "reply", text: reply })}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {item.options.map((option, index) => (
              <Button
                key={option.id}
                variant={index === 0 ? "primary" : "secondary"}
                unavailable={unavailable}
                busy={busy({ kind: "option", option: option.id })}
                onClick={() => void send({ kind: "option", option: option.id })}
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </section>
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

interface ReplyFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly unavailable: { readonly reason: string } | undefined;
  readonly busy: boolean;
  readonly onSend: () => void;
}

/** A question with no options takes a written answer. */
function ReplyField({ value, onChange, unavailable, busy, onSend }: ReplyFieldProps) {
  const fieldId = useId();
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
      <div>
        <Button
          variant="primary"
          unavailable={unavailable ?? (value.trim() === "" ? { reason: fieldId } : undefined)}
          busy={busy}
          onClick={onSend}
        >
          Send answer
        </Button>
      </div>
    </div>
  );
}
