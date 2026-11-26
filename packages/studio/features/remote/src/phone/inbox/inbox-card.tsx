import type { AnswerResult, GatewayInboxAnswer, InboxItem } from "@halonicjs/ports";
import { BackIcon, Button, TextArea } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { MessagingClient, MessagingOutcome } from "../messaging-client.ts";
import { RECONNECT_TO_ANSWER, type RemoteView } from "../remote-view.ts";
import { sendOutcomeLine } from "../send-words.ts";
import { ANSWER_RISKY_ON_COMPUTER } from "../view-of.ts";
import { inboxWords } from "./inbox-words.ts";

/**
 * Whether the phone answers `item` at all: not a `risky` one until the computer's "Let phones
 * answer risky approvals" is on for this phone, and never one that asks several questions, runs
 * an action or is answered somewhere else, which only the computer or the source shows in full.
 */
export function answersOnPhone(item: InboxItem, view: RemoteView): boolean {
  if (item.questions || item.action || item.stepper || item.answerElsewhere) return false;
  return item.risk !== "risky" || view.answersRisky;
}

/** The card's answers are off, with the line that says why, if any; `undefined` while they are on. */
type Off = { readonly line: string | undefined } | undefined;

/**
 * Why the card's answers are off, first reason first. Off with no line while the owner check
 * hasn't answered yet, so a phone that has a screen lock never flashes the line asking for one.
 */
function offOf(item: InboxItem, view: RemoteView): Off {
  if (!view.canAnswer) return { line: view.offReason ?? RECONNECT_TO_ANSWER };
  if (!answersOnPhone(item, view)) return { line: ANSWER_RISKY_ON_COMPUTER };
  if (view.ownerCheck === "unavailable") return { line: inboxWords.noScreenLock };
  if (view.ownerCheck === "unknown") return { line: undefined };
  return undefined;
}

/** What the card says after its answer: a settled line with Next, or a line under the buttons. */
type Answered =
  | { readonly settled: true; readonly line: string }
  | { readonly settled: false; readonly line: string | undefined };

function answeredOf(
  outcome: MessagingOutcome<AnswerResult>,
  answer: string,
  computer: string,
): Answered {
  if (outcome.kind !== "done") return { settled: false, line: sendOutcomeLine("answer", outcome) };
  const result = outcome.value;
  if (result.outcome === "answered") {
    return { settled: true, line: inboxWords.youChose(answer, result.answeredAt) };
  }
  if (result.outcome === "already-answered") {
    const line =
      result.by.kind === "me"
        ? inboxWords.answeredOn(computer, result.answeredAt)
        : inboxWords.answeredBy(result.by.name, result.answeredAt);
    return { settled: true, line };
  }
  if (result.reason === "not-found") return { settled: true, line: inboxWords.gone };
  return { settled: false, line: ANSWER_RISKY_ON_COMPUTER };
}

/**
 * `p03a`–`p03f`: one Inbox card, with its options, or a reply box when it offers none. Each answer
 * goes once; the shell asks the owner check before it lets one out. Off with the reason under the
 * buttons while the view is stale, the card is risky, or the phone has no screen lock.
 */
export function InboxCard({
  item,
  view,
  messaging,
  computer,
  onBack,
  onOpenSettings,
}: {
  readonly item: InboxItem;
  readonly view: RemoteView;
  readonly messaging: MessagingClient;
  readonly computer: string;
  readonly onBack: () => void;
  readonly onOpenSettings: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [sending, setSending] = useState<string | undefined>(undefined);
  const [answered, setAnswered] = useState<Answered | undefined>(undefined);
  useEffect(() => heading.current?.focus(), []);
  const off = offOf(item, view);
  const settled = answered?.settled === true;
  const send = (key: string, label: string, answer: GatewayInboxAnswer) => {
    if (off !== undefined || sending !== undefined) return;
    setSending(key);
    setAnswered(undefined);
    void messaging
      .answer(item.id, answer)
      .catch((): MessagingOutcome<AnswerResult> => ({ kind: "cut-off" }))
      .then((outcome) => {
        setSending(undefined);
        setAnswered(answeredOf(outcome, label, computer));
      });
  };
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <Button
          variant="ghost"
          size="touch"
          icon={<BackIcon />}
          label={inboxWords.back}
          onClick={onBack}
        />
      </div>
      <h2 ref={heading} tabIndex={-1} className="rounded-sm text-body-strong text-fg focus-ring">
        {item.from.kind === "agent" ? item.from.name : inboxWords.needsYou}
      </h2>
      <p className="whitespace-pre-wrap text-body text-fg">{item.question}</p>
      {settled ? null : (
        <CardAnswers
          item={item}
          off={off}
          sending={sending}
          onSend={send}
          onOpenSettings={onOpenSettings}
        />
      )}
      <p role="status" className="text-small text-fg-muted">
        {answered?.line}
      </p>
      {settled ? (
        <Button variant="primary" size="touch" onClick={onBack}>
          {inboxWords.next}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The card's options, or its reply box and Reply, off with `off`'s line under them; Open settings
 * too while the phone has no screen lock.
 */
function CardAnswers({
  item,
  off,
  sending,
  onSend,
  onOpenSettings,
}: {
  readonly item: InboxItem;
  readonly off: Off;
  /** The option, or `reply`, whose answer is on its way. */
  readonly sending: string | undefined;
  readonly onSend: (key: string, label: string, answer: GatewayInboxAnswer) => void;
  readonly onOpenSettings: () => void;
}) {
  const reasonId = useId();
  const [text, setText] = useState("");
  const unavailable = off === undefined ? undefined : { reason: reasonId };
  return (
    <div className="flex flex-col gap-2">
      {item.options.length === 0 ? (
        <>
          <TextArea
            aria-label={inboxWords.reply}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Button
            variant="primary"
            size="touch"
            unavailable={unavailable}
            busy={sending === "reply"}
            onClick={() => onSend("reply", text, { kind: "reply", text })}
          >
            {inboxWords.reply}
          </Button>
        </>
      ) : (
        item.options.map((option) => (
          <Button
            key={option.id}
            variant="secondary"
            size="touch"
            unavailable={unavailable}
            busy={sending === option.id}
            onClick={() => onSend(option.id, option.label, { kind: "option", option: option.id })}
          >
            {option.label}
          </Button>
        ))
      )}
      {off?.line === undefined ? null : (
        <p id={reasonId} className="text-small text-fg-muted">
          {off.line}
        </p>
      )}
      {off?.line === inboxWords.noScreenLock ? (
        <Button variant="secondary" size="touch" onClick={onOpenSettings}>
          {inboxWords.openSettings}
        </Button>
      ) : null}
    </div>
  );
}
