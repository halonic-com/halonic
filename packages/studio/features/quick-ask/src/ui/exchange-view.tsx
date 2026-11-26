import type { Message, MessagingId } from "@halonicjs/ports";
import { Button, ChatText, enter, standaloneLinkClasses } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef } from "react";
import type { AnswerState } from "../ask-answer.ts";
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
 * with the reason.
 */
export function ExchangeView({ exchange, onRetry, onOpenChat }: ExchangeViewProps) {
  const agent = exchange.agent.agent.name;
  const notSent = exchange.status === "not-sent";
  return (
    <li className="flex flex-col">
      <Arriving className="flex flex-col items-end">
        <p
          data-question=""
          className={`max-w-[85%] whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-body ${
            notSent ? "border border-danger" : "border border-transparent"
          }`}
        >
          {exchange.question}
        </p>
      </Arriving>
      {/* Only what comes back is read out, once: not the question just typed. Shown while empty,
          as a hidden live region may not be heard once it fills. */}
      <div aria-live="polite" className="mt-2 flex flex-col gap-2 empty:mt-0">
        {notSent ? <NotSent exchange={exchange} onRetry={onRetry} /> : null}
        {exchange.status === "sent" ? (
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

function AnswerView({
  agent,
  answer,
  onAnswerCard,
}: {
  readonly agent: string;
  readonly answer: AnswerState | undefined;
  readonly onAnswerCard: () => void;
}) {
  if (answer === undefined || answer.kind === "waiting") return <CanClose agent={agent} />;
  if (answer.kind === "working") {
    return (
      <div className="flex flex-col gap-1">
        <WorkingLine agent={agent} />
        <CanClose agent={agent} />
      </div>
    );
  }
  return (
    <Arriving data-answer="" className="flex max-h-[380px] flex-col gap-2 overflow-y-auto">
      <Replies messages={answer.messages} />
      {answer.kind === "card" ? (
        <div className="flex flex-col items-start gap-2 rounded-md border border-border px-3 py-2">
          <div>
            <p className="text-body-strong">{quickAskWords.cardAsks(agent)}</p>
            <p className="text-body">{answer.card.question}</p>
          </div>
          <Button variant="primary" size="sm" onClick={onAnswerCard}>
            {quickAskWords.answerInMessenger}
          </Button>
        </div>
      ) : null}
    </Arriving>
  );
}

function Replies({ messages }: { readonly messages: readonly Message[] }) {
  return messages.map((message) => (
    <div key={message.id} className="text-body">
      <ChatText>{message.body}</ChatText>
    </div>
  ));
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
