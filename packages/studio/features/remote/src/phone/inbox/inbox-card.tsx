import type { AnswerResult, GatewayInboxAnswer, InboxItem } from "@halonicjs/ports";
import {
  BackIcon,
  Button,
  Callout,
  type CalloutTone,
  LaptopIcon,
  LockIcon,
  StatusChip,
  TextArea,
  TickIcon,
  waitingFor,
} from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { MessagingClient, MessagingOutcome } from "../messaging-client.ts";
import { RECONNECT_TO_ANSWER, type RemoteView } from "../remote-view.ts";
import { sendOutcomeLine } from "../send-words.ts";
import { ANSWER_RISKY_ON_COMPUTER } from "../view-of.ts";
import { askerLine, cardBody, cardTitle } from "./inbox-text.ts";
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

/**
 * Why the card's answers are off, as the Callout above them says it (p03e–p03g): its line, tone
 * and icon, and Open settings while the phone has no screen lock. No line while the owner check
 * hasn't answered yet, so a phone that has a screen lock never flashes the one asking for it.
 */
interface OffReason {
  readonly line: string;
  readonly tone: CalloutTone;
  readonly icon?: ReactNode;
  readonly settings?: true;
}

/** The card's answers are off, with the reason if there is one; `undefined` while they are on. */
type Off = { readonly reason: OffReason | undefined } | undefined;

/** Why the card's answers are off, first reason first. */
function offOf(item: InboxItem, view: RemoteView): Off {
  if (!view.canAnswer) {
    return { reason: { line: view.offReason ?? RECONNECT_TO_ANSWER, tone: "info" } };
  }
  if (!answersOnPhone(item, view)) {
    return { reason: { line: ANSWER_RISKY_ON_COMPUTER, tone: "info", icon: <LockIcon /> } };
  }
  if (view.ownerCheck === "unavailable") {
    return { reason: { line: inboxWords.noScreenLock, tone: "attention", settings: true } };
  }
  if (view.ownerCheck === "unknown") return { reason: undefined };
  return undefined;
}

/**
 * What the card says after its answer: a settled line, with the check mark for the person's own
 * answer or the laptop for one given on the computer, and Next; or a line about the send.
 */
type Answered =
  | { readonly settled: true; readonly line: string; readonly mark: "chose" | "computer" | "none" }
  | { readonly settled: false; readonly line: string | undefined };

function answeredOf(
  outcome: MessagingOutcome<AnswerResult>,
  answer: string,
  computer: string,
): Answered {
  if (outcome.kind !== "done") return { settled: false, line: sendOutcomeLine("answer", outcome) };
  const result = outcome.value;
  if (result.outcome === "answered") {
    return { settled: true, line: inboxWords.youChose(answer, result.answeredAt), mark: "chose" };
  }
  if (result.outcome === "already-answered") {
    if (result.by.kind === "me") {
      const line = inboxWords.answeredOn(computer, result.answeredAt);
      return { settled: true, line, mark: "computer" };
    }
    const line = inboxWords.answeredBy(result.by.name, result.answeredAt);
    return { settled: true, line, mark: "none" };
  }
  if (result.reason === "not-found") return { settled: true, line: inboxWords.gone, mark: "none" };
  return { settled: false, line: ANSWER_RISKY_ON_COMPUTER };
}

const marks = { chose: <TickIcon />, computer: <LaptopIcon />, none: null } as const;

/**
 * `p03a`–`p03g`: one Inbox card. Its header is the Needs you chip and the wait, the card's title
 * and who asks; then the rest of the question and its options, the first one filled, or a reply box
 * when it offers none. Each answer goes once; the shell asks the owner check before it lets one
 * out. While the answers are off, a Callout above them says why. After an answer the options stay,
 * turned off, under the line that says what became of it, with Next.
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
  const lineId = useId();
  const [sending, setSending] = useState<string | undefined>(undefined);
  const [answered, setAnswered] = useState<Answered | undefined>(undefined);
  useEffect(() => heading.current?.focus(), []);
  const settled = answered?.settled === true;
  const off = settled ? undefined : offOf(item, view);
  const send = (key: string, label: string, answer: GatewayInboxAnswer) => {
    if (settled || off !== undefined || sending !== undefined) return;
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
  const body = cardBody(item);
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <Button variant="ghost" size="touch" icon={<BackIcon />} onClick={onBack}>
          {inboxWords.back}
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="warning" dot>
            {inboxWords.needsYou}
          </StatusChip>
          <span className="text-small text-fg-muted">
            {waitingFor(new Date(item.createdAt), new Date())}
          </span>
        </div>
        <h2 ref={heading} tabIndex={-1} className="rounded-sm text-heading text-fg focus-ring">
          {cardTitle(item)}
        </h2>
        <p className="text-small text-fg-muted">{askerLine(item)}</p>
      </div>
      {body === "" ? null : <p className="whitespace-pre-wrap text-body text-fg">{body}</p>}
      {/* The line stays for screen readers but takes no gap while it's empty. */}
      <div className="flex flex-col">
        <p
          id={lineId}
          role="status"
          className="mb-2 flex items-center gap-1 text-small text-fg-muted empty:mb-0"
        >
          {answered?.settled === true && answered.mark !== "none" ? (
            <span aria-hidden="true" className="size-4 shrink-0 *:size-full">
              {marks[answered.mark]}
            </span>
          ) : null}
          {answered?.line}
        </p>
        <CardAnswers
          item={item}
          off={off}
          offBy={settled ? lineId : undefined}
          sending={sending}
          onSend={send}
          onOpenSettings={onOpenSettings}
        />
      </div>
      {settled ? (
        <Button variant="primary" size="touch" onClick={onBack}>
          {inboxWords.next}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The card's options, the first one filled, or its reply box and Reply, under `off`'s Callout;
 * the Callout carries Open settings while the phone has no screen lock. Once answered, `offBy`
 * names the line that says so, and every answer stays, turned off.
 */
function CardAnswers({
  item,
  off,
  offBy,
  sending,
  onSend,
  onOpenSettings,
}: {
  readonly item: InboxItem;
  readonly off: Off;
  readonly offBy: string | undefined;
  /** The option, or `reply`, whose answer is on its way. */
  readonly sending: string | undefined;
  readonly onSend: (key: string, label: string, answer: GatewayInboxAnswer) => void;
  readonly onOpenSettings: () => void;
}) {
  const reasonId = useId();
  const [text, setText] = useState("");
  const reason = off?.reason;
  let unavailable: { readonly reason: string } | undefined;
  if (offBy !== undefined) unavailable = { reason: offBy };
  else if (off !== undefined) unavailable = { reason: reasonId };
  return (
    <div className="flex flex-col gap-2">
      {reason === undefined ? null : (
        <div id={reasonId}>
          <Callout
            tone={reason.tone}
            icon={reason.icon}
            {...(reason.settings === true
              ? { action: { label: inboxWords.openSettings, onClick: onOpenSettings } }
              : {})}
          >
            {reason.line}
          </Callout>
        </div>
      )}
      {item.options.length === 0 ? (
        <>
          <TextArea
            aria-label={inboxWords.reply}
            value={text}
            readOnly={offBy !== undefined}
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
        item.options.map((option, index) => (
          <Button
            key={option.id}
            variant={index === 0 ? "primary" : "secondary"}
            size="touch"
            unavailable={unavailable}
            busy={sending === option.id}
            onClick={() => onSend(option.id, option.label, { kind: "option", option: option.id })}
          >
            {option.label}
          </Button>
        ))
      )}
    </div>
  );
}
