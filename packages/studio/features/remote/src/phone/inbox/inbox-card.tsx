import type { AnswerResult, GatewayInboxAnswer, InboxItem } from "@halonicjs/ports";
import {
  BackIcon,
  Button,
  Callout,
  InfoIcon,
  LaptopIcon,
  LockIcon,
  StatusChip,
  TextArea,
  TickIcon,
  WifiIcon,
  waitingFor,
} from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { MessagingClient, MessagingOutcome } from "../messaging-client.ts";
import { RECONNECT_TO_ANSWER, type RemoteView } from "../remote-view.ts";
import { sendOutcomeLine } from "../send-words.ts";
import { ANSWER_RISKY_ON_COMPUTER } from "../view-of.ts";
import { inboxWords } from "./inbox-words.ts";
import { askerLine, itemBody, itemTitle, workLabel } from "./item-text.ts";
import type { PhoneInboxNames } from "./use-phone-inbox.ts";

/**
 * Whether the phone answers `item` at all: not a `risky` one until the computer's "Let phones
 * answer risky approvals" is on for this phone, and never one that asks several questions, runs
 * an action or is answered somewhere else, which only the computer or the source shows in full.
 */
export function answersOnPhone(item: InboxItem, view: RemoteView): boolean {
  if (item.questions || item.action || item.stepper || item.answerElsewhere) return false;
  return item.risk !== "risky" || view.answersRisky;
}

/** Why the card's answers are off, first reason first; `undefined` while they are on. */
function offReasonOf(item: InboxItem, view: RemoteView): string | undefined {
  if (!view.canAnswer) return view.offReason ?? RECONNECT_TO_ANSWER;
  if (!answersOnPhone(item, view)) return ANSWER_RISKY_ON_COMPUTER;
  if (!view.ownerCheckAvailable) return inboxWords.noScreenLock;
  return undefined;
}

/** Who settled the card, for the decision line's icon: here, on the computer, elsewhere, or gone. */
type DecidedBy = "here" | "computer" | "elsewhere" | "gone";

/** What the card says after its answer: a settled decision with Next, or a line under the buttons. */
type Answered =
  | { readonly settled: true; readonly line: string; readonly by: DecidedBy }
  | { readonly settled: false; readonly line: string | undefined };

function answeredOf(
  outcome: MessagingOutcome<AnswerResult>,
  answer: string,
  computer: string,
): Answered {
  if (outcome.kind !== "done") return { settled: false, line: sendOutcomeLine("answer", outcome) };
  const result = outcome.value;
  if (result.outcome === "answered") {
    return { settled: true, by: "here", line: inboxWords.youChose(answer, result.answeredAt) };
  }
  if (result.outcome === "already-answered") {
    if (result.by.kind === "me") {
      const line = inboxWords.answeredOn(computer, result.answeredAt);
      return { settled: true, by: "computer", line };
    }
    const line = inboxWords.answeredBy(result.by.name, result.answeredAt);
    return { settled: true, by: "elsewhere", line };
  }
  if (result.reason === "not-found") return { settled: true, by: "gone", line: inboxWords.gone };
  return { settled: false, line: ANSWER_RISKY_ON_COMPUTER };
}

const decidedIcons: Record<DecidedBy, ReactNode> = {
  here: <TickIcon />,
  computer: <LaptopIcon />,
  elsewhere: <TickIcon />,
  gone: <InfoIcon />,
};

/**
 * `p03a`–`p03g`: one Inbox card. The head says it needs you and how long it has waited, then the
 * title, who asks and where, the work, and the rest of the question. The first option is primary,
 * the others and Reply secondary. Each answer goes once; the shell asks the owner check before it
 * lets one out. Off, with the reason over the buttons, while the view is stale, the card is risky
 * or the phone has no screen lock. Once settled, the options stay, off, under the decision.
 */
export function InboxCard({
  item,
  view,
  messaging,
  computer,
  names,
  onBack,
  onOpenSettings,
}: {
  readonly item: InboxItem;
  readonly view: RemoteView;
  readonly messaging: MessagingClient;
  readonly computer: string;
  readonly names: PhoneInboxNames;
  readonly onBack: () => void;
  readonly onOpenSettings: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const reasonId = useId();
  const [sending, setSending] = useState<string | undefined>(undefined);
  const [answered, setAnswered] = useState<Answered | undefined>(undefined);
  useEffect(() => heading.current?.focus(), []);
  const settled = answered?.settled === true ? answered : undefined;
  const offReason = offReasonOf(item, view);
  const send = (key: string, label: string, answer: GatewayInboxAnswer) => {
    if (offReason !== undefined || sending !== undefined || settled !== undefined) return;
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
  const work = item.work === undefined ? undefined : names.work.get(item.work);
  const body = itemBody(item);
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
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2">
          <StatusChip tone="warning" dot>
            {inboxWords.needsYou}
          </StatusChip>
          <span className="text-caption text-fg-muted">
            {waitingFor(new Date(item.createdAt), new Date())}
          </span>
        </p>
        <h2 ref={heading} tabIndex={-1} className="rounded-sm text-heading text-fg focus-ring">
          {itemTitle(item)}
        </h2>
        <p className="text-small text-fg-muted">
          {askerLine(item, names.sources.get(item.source))}
        </p>
        {work === undefined ? null : (
          <p className="text-small text-accent-text">{workLabel(work)}</p>
        )}
      </div>
      {body === "" ? null : <p className="whitespace-pre-wrap text-body text-fg">{body}</p>}
      {settled === undefined ? (
        <OffReason id={reasonId} reason={offReason} onOpenSettings={onOpenSettings} />
      ) : (
        <p
          id={reasonId}
          className="flex items-center gap-2 rounded-sm bg-surface-muted px-3 py-2 text-small text-fg"
        >
          <span aria-hidden="true" className="inline-grid size-icon-sm shrink-0 *:size-full">
            {decidedIcons[settled.by]}
          </span>
          {settled.line}
        </p>
      )}
      <CardAnswers
        item={item}
        off={offReason === undefined && settled === undefined ? undefined : reasonId}
        replies={answersOnPhone(item, view) && settled === undefined}
        sending={sending}
        onSend={send}
      />
      {/* Says what became of the answer; once settled the decision line shows it, so it is heard only. */}
      <p role="status" className={settled === undefined ? "text-small text-fg-muted" : "sr-only"}>
        {answered?.line}
      </p>
      {settled === undefined ? null : (
        <Button variant="primary" size="touch" onClick={onBack}>
          {inboxWords.next}
        </Button>
      )}
    </div>
  );
}

/**
 * Why the answers are off, over them (p03e–g): risky in a neutral callout with the lock, no screen
 * lock in an attention one with Open settings, and offline in a neutral one with the Wi-Fi mark.
 * The reason's words carry `id`, which the buttons point `aria-describedby` at.
 */
function OffReason({
  id,
  reason,
  onOpenSettings,
}: {
  readonly id: string;
  readonly reason: string | undefined;
  readonly onOpenSettings: () => void;
}) {
  if (reason === undefined) return null;
  const words = <span id={id}>{reason}</span>;
  if (reason === inboxWords.noScreenLock) {
    const action = { label: inboxWords.openSettings, onClick: onOpenSettings };
    return (
      <Callout tone="attention" icon={<LockIcon />} action={action}>
        {words}
      </Callout>
    );
  }
  const icon = reason === ANSWER_RISKY_ON_COMPUTER ? <LockIcon /> : <WifiIcon />;
  return (
    <Callout tone="info" icon={icon}>
      {words}
    </Callout>
  );
}

/**
 * The card's options, the first primary, then Reply, which opens the reply box and then sends it.
 * A card without options opens with its reply box. All off, pointing at `off`, while that is set.
 */
function CardAnswers({
  item,
  off,
  replies,
  sending,
  onSend,
}: {
  readonly item: InboxItem;
  /** The id of the words that say why the answers are off, or of the decision once settled. */
  readonly off: string | undefined;
  /** Whether Reply shows: not on a card only the computer answers, nor once it is settled. */
  readonly replies: boolean;
  /** The option, or `reply`, whose answer is on its way. */
  readonly sending: string | undefined;
  readonly onSend: (key: string, label: string, answer: GatewayInboxAnswer) => void;
}) {
  const [text, setText] = useState("");
  const [replying, setReplying] = useState(item.options.length === 0);
  const unavailable = off === undefined ? undefined : { reason: off };
  return (
    <div className="flex flex-col gap-2">
      {item.options.map((option, index) => (
        <Button
          key={option.id}
          variant={index === 0 && !replying ? "primary" : "secondary"}
          size="touch"
          unavailable={unavailable}
          busy={sending === option.id}
          onClick={() => onSend(option.id, option.label, { kind: "option", option: option.id })}
        >
          {option.label}
        </Button>
      ))}
      {replies && replying ? (
        <TextArea
          aria-label={inboxWords.reply}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      ) : null}
      {replies ? (
        <Button
          variant={replying ? "primary" : "secondary"}
          size="touch"
          unavailable={unavailable}
          busy={sending === "reply"}
          onClick={() => {
            if (!replying) return setReplying(true);
            onSend("reply", text, { kind: "reply", text });
          }}
        >
          {inboxWords.reply}
        </Button>
      ) : null}
    </div>
  );
}
