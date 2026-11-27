import type { Message, MessagingId } from "@halonicjs/ports";
import {
  Avatar,
  Button,
  ChatMessage,
  ChatText,
  decidedAt,
  enter,
  standaloneLinkClasses,
} from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { type AnswerState, isAnswered } from "../ask-answer.ts";
import { quickAskWords } from "../quick-ask-words.ts";
import type { Exchange } from "./use-ask-box.ts";

/** The props of {@link ExchangeView}. */
export interface ExchangeViewProps {
  readonly exchange: Exchange;
  readonly onRetry: (exchange: Exchange) => void;
  /** Opens the exchange's chat in Messenger, for **Answer in Messenger** on a card. */
  readonly onOpenChat: (conversation: MessagingId) => void;
}

/**
 * One question asked from the box and where its answer stands (design HAL-18594, sections 4–5):
 * the question at once (motion 4), then the working line while the agent works, the answer as it
 * arrives (motion 3), what a card asks with **Answer in Messenger**, or **Not sent · Try again**
 * with the reason, and "Sending…" once Try again sends it again (design HAL-19384).
 */
export function ExchangeView({ exchange, onRetry, onOpenChat }: ExchangeViewProps) {
  const agent = exchange.agent.agent.name;
  const notSent = exchange.status === "not-sent";
  const sent = exchange.status === "sent";
  const arrived = exchange.answer !== undefined && isAnswered(exchange.answer);
  return (
    <li className="flex flex-col">
      <Arriving className="flex flex-col items-end">
        <div
          data-question-bubble=""
          className={`flex max-w-[85%] flex-col items-end rounded-lg bg-surface-muted px-3 py-2 ${
            notSent ? "border border-danger" : "border border-transparent"
          }`}
        >
          <p data-question="" className="self-stretch whitespace-pre-wrap text-body">
            {exchange.question}
          </p>
          {exchange.sentAt === undefined ? null : (
            <p data-question-time="" className="text-caption text-fg-muted">
              {decidedAt(new Date(exchange.sentAt))}
            </p>
          )}
        </div>
      </Arriving>
      {/* There from the start, so a screen reader hears "Sending…" when Try again sends the
          question again; the first send fills nothing and stays silent. */}
      <div role="status" className="flex flex-col">
        {exchange.status === "sending" && exchange.retried === true ? (
          <p data-sending="" className="mt-1 self-end text-small text-fg-muted">
            {quickAskWords.sending}
          </p>
        ) : null}
      </div>
      {sent && !arrived ? <PendingLines agent={agent} answer={exchange.answer} /> : null}
      {/* Only what comes back is read out, once: not the question just typed, nor the waiting
          and working lines. Shown while empty, as a hidden live region may not be heard once it
          fills. */}
      <div data-reply="" aria-live="polite" className="mt-2 flex flex-col gap-2 empty:mt-0">
        {notSent ? <NotSent exchange={exchange} onRetry={onRetry} /> : null}
        {sent && exchange.answer !== undefined && arrived ? (
          <AnswerView
            agent={agent}
            answer={exchange.answer}
            onAnswerCard={() => onOpenChat(exchange.agent.row.conversation.id)}
          />
        ) : null}
      </div>
    </li>
  );
}

/** Under a question that didn't go out: **Not sent · Try again**, and the reason. */
function NotSent({ exchange, onRetry }: Pick<ExchangeViewProps, "exchange" | "onRetry">) {
  const agent = exchange.agent.agent.name;
  return (
    <Arriving className="-mt-1 flex flex-col items-end gap-1">
      <p className="text-small text-danger">
        {`${quickAskWords.notSent} · `}
        <button type="button" className={standaloneLinkClasses} onClick={() => onRetry(exchange)}>
          {quickAskWords.tryAgain}
        </button>
      </p>
      <p className="text-small text-fg-muted">
        {quickAskWords.unreachable(exchange.agent.row.source?.label ?? agent)}
      </p>
    </Arriving>
  );
}

/** While the answer is on its way: the working line once the agent works, and that the box can close. */
function PendingLines({
  agent,
  answer,
}: {
  readonly agent: string;
  readonly answer: AnswerState | undefined;
}) {
  return (
    <div data-pending="" className="mt-2 flex flex-col gap-1">
      {answer?.kind === "working" ? <WorkingLine agent={agent} /> : null}
      <CanClose agent={agent} />
    </div>
  );
}

/** The answer once it has come: the agent's replies, and what a card asks. */
function AnswerView({
  agent,
  answer,
  onAnswerCard,
}: {
  readonly agent: string;
  readonly answer: AnswerState;
  readonly onAnswerCard: () => void;
}) {
  if (answer.kind === "waiting" || answer.kind === "working") return null;
  return (
    <Arriving data-answer="" className="flex flex-col gap-2">
      <Replies agent={agent} messages={answer.messages} />
      {answer.kind === "card" ? (
        <CardAsks agent={agent} question={answer.card.question} onAnswer={onAnswerCard} />
      ) : null}
    </Arriving>
  );
}

/**
 * What a card asks, with **Answer in Messenger**. The button is described by the card's question,
 * so a screen reader tells one card's button from another's when several answers hold a card.
 */
function CardAsks({
  agent,
  question,
  onAnswer,
}: {
  readonly agent: string;
  readonly question: string;
  readonly onAnswer: () => void;
}) {
  const questionId = useId();
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-border px-3 py-2">
      <div>
        <p className="text-body-strong">{quickAskWords.cardAsks(agent)}</p>
        <p id={questionId} className="text-body">
          {question}
        </p>
      </div>
      <Button variant="primary" size="sm" aria-describedby={questionId} onClick={onAnswer}>
        {quickAskWords.answerInMessenger}
      </Button>
    </div>
  );
}

/**
 * The agent's replies under its picture and "Chief · 14:06", the time of its first reply, as
 * Messenger starts an agent's run of messages. The line is for the eye; the reply's hidden heading
 * says the same to a screen reader.
 */
function Replies({
  agent,
  messages,
}: {
  readonly agent: string;
  readonly messages: readonly Message[];
}) {
  const first = messages[0];
  if (first === undefined) return null;
  const time = decidedAt(new Date(first.sentAt));
  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={agent} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p data-answer-author="" aria-hidden="true" className="text-small text-fg-muted">
          <bdi className="text-fg">{agent}</bdi> · {time}
        </p>
        <ChatMessage from="reply" heading={`${agent} · ${time}`} headingLevel={2}>
          {messages.map((message) => (
            <div key={message.id} className="text-body">
              <ChatText>{message.body}</ChatText>
            </div>
          ))}
        </ChatMessage>
      </div>
    </div>
  );
}

function CanClose({ agent }: { readonly agent: string }) {
  return <p className="text-small text-fg-muted">{quickAskWords.canClose(agent)}</p>;
}

/**
 * The approved "Chief is working" line: its dot breathes while the agent works (motion 3), and
 * stays still under reduced motion, or where the page can't animate.
 */
function WorkingLine({ agent }: { readonly agent: string }) {
  const dot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = dot.current;
    if (element === null || typeof element.animate !== "function") return;
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true) return;
    const breath = element.animate([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], {
      duration: 1600,
      iterations: Number.POSITIVE_INFINITY,
      easing: "ease-in-out",
    });
    return () => breath.cancel();
  }, []);
  return (
    <p data-working="" className="flex items-center gap-2 text-small text-fg">
      <span ref={dot} aria-hidden="true" className="size-2 rounded-full bg-running" />
      {quickAskWords.working(agent)}
    </p>
  );
}

/** Fades its content in, rising 8 px, when it first shows (the kit's `enter`). */
function Arriving({
  className,
  children,
  ...data
}: {
  readonly className: string;
  readonly children: ReactNode;
  readonly "data-answer"?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (element.current !== null) void enter(element.current);
  }, []);
  return (
    <div ref={element} className={className} {...data}>
      {children}
    </div>
  );
}

/** The text of an answer, for **Copy**: its messages, a blank line apart. */
export function answerText(answer: AnswerState | undefined): string | undefined {
  if (answer === undefined || answer.kind === "waiting" || answer.kind === "working")
    return undefined;
  return answer.messages.map((message) => message.body).join("\n\n");
}
