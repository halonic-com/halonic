import { markHiddenName } from "@halonicjs/std";
import { Button, type ButtonUnavailable, type CalloutHandle, Tooltip } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import type { InboxDecisions } from "../decide.ts";
import type { WaitItem } from "../inbox-items.ts";
import { decidedAt, movesOnLine, waitingSince } from "../plain/waiting-time.ts";
import {
  type BackLink,
  CardHeader,
  cardBodyClasses,
  cardClasses,
  DecidedBar,
  type EngineState,
  FailedLine,
  failureDetailOf,
  type ManualAnswer,
  manualAnswerOf,
  type NextItem,
  NotAnsweringLine,
  StaleBar,
  unavailableWhile,
  useEveryMinute,
  wasDecidedElsewhere,
  wasRefusedUntrusted,
} from "./card-parts.tsx";
import { type DecisionGuard, useDecisionGuard } from "./decision-guard.ts";
import { PlainValue } from "./plain-value.tsx";
import {
  showsUntrusted,
  type TrustReview,
  useClearedWhenTrusted,
  withoutUntrusted,
} from "./workspace-trust.ts";

export interface WaitCardProps extends EngineState {
  readonly item: WaitItem;
  readonly decisions: Pick<InboxDecisions, "answer">;
  /** Opens the run; without it the card has no **Open run**. */
  readonly onOpenRun?: ((runId: string) => void) | undefined;
  /** What started the run, after "Started by" in the header; without it the card has no such line. */
  readonly startedBy?: string | undefined;
  /** The next item, or `null` when nothing else is waiting. */
  readonly next: NextItem | null;
  /** Where you came from, for **Back to run** or **Back to the chat**; `null` from the Inbox itself. */
  readonly back: BackLink | null;
  /** The clock, so a test can set it. */
  readonly now?: () => Date;
  /**
   * `false` once the run no longer waits at this step, answered from the command line, another
   * window or a timer: a card not answered here turns stale (flow-inbox 5.4). `true` when left out.
   */
  readonly waiting?: boolean;
  /**
   * The workspace's trust, for an answer refused because the workspace isn't trusted: **Review**,
   * and when it becomes trusted the line goes and the first answer takes focus. Without it there's
   * no **Review**.
   */
  readonly trust?: TrustReview | undefined;
}

type CardState =
  | {
      readonly kind: "open";
      readonly failed: string | null;
      /** The answer was refused because the run isn't waiting at this step any more. */
      readonly elsewhere: boolean;
      readonly manual: ManualAnswer | null;
      /** The failure's own sentence, shown after "Couldn't record your decision.". */
      readonly detail: string | null;
      /** The answer was refused because the workspace isn't trusted. */
      readonly untrusted: boolean;
    }
  | { readonly kind: "answering"; readonly event: string }
  | { readonly kind: "answered"; readonly event: string; readonly at: Date };

/**
 * An answer's label, on its button and in the decided line alike: the step's own label when it
 * has one, with hidden characters marked, else "Approve" and "Reject", else the event's name in
 * words with a capital first letter, `needs_info` as "Needs info".
 */
export function answerLabel(event: string, own?: string): string {
  if (own !== undefined && own.trim() !== "") return markHiddenName(own.trim());
  const words = event.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The step's own label for an answer, or `undefined` without one. Events come from the user's
 * workflow, so one named `constructor` must not find an `Object.prototype` member.
 */
function ownLabel(labels: Readonly<Record<string, string>>, event: string): string | undefined {
  return Object.hasOwn(labels, event) ? labels[event] : undefined;
}

/**
 * An answer's busy label: "Approving…" and "Rejecting…" only beside the built-in "Approve" and
 * "Reject", else the neutral "Working…", so it never names the answer with another word.
 */
function busyLabel(event: string, own?: string): string {
  if (answerLabel(event, own) === answerLabel(event)) {
    if (event === "approve") return "Approving…";
    if (event === "reject") return "Rejecting…";
  }
  return "Working…";
}

/**
 * What the decided line says happens next: "The run continues." after an approve, whatever the
 * step calls it. A reject is the step's own answer, so it says nothing about a tool call or the
 * agent, and neither does any other answer.
 */
function whatNext(event: string): string {
  return event === "approve" ? " The run continues." : "";
}

/**
 * The decided Callout of a wait step (mc 5). An answer the step labels itself, and any answer
 * other than approve and reject, names the button you pressed with the same word (HAL-4008),
 * followed by what happens next as the built-in line says it (HAL-4050).
 */
export function answeredText(event: string, at: Date, own?: string): string {
  const time = decidedAt(at);
  const label = answerLabel(event, own);
  if (label === answerLabel(event)) {
    if (event === "approve") return `Approved by you at ${time}.${whatNext(event)}`;
    if (event === "reject") return `Rejected by you at ${time}.${whatNext(event)}`;
  }
  return `You chose ${label} at ${time}.${whatNext(event)}`;
}

/**
 * The card for a run waiting at a `wait` step (`inbox.wait-card`), such as Acme's "Approve this
 * reply?": the step's first line as its title, the rest as plain text, the timer line if the
 * step has one, and a button per answer the step takes, the first one primary and full width,
 * none red. It has the approval card's 1 s guard, and is replaced in place once answered.
 */
export function WaitCard(props: WaitCardProps) {
  const { item, decisions, next, back } = props;
  const now = props.now ?? (() => new Date());
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const answered = useRef<CalloutHandle>(null);
  const [state, setState] = useState<CardState>({
    kind: "open",
    failed: null,
    elsewhere: false,
    manual: null,
    detail: null,
    untrusted: false,
  });
  const [usableAt] = useState(() => now().getTime());
  const guard = useDecisionGuard(usableAt, () => now().getTime());
  const bar = useRef<HTMLDivElement>(null);
  useEveryMinute();
  useClearedWhenTrusted(
    props.trust,
    showsUntrusted(state),
    () => setState(withoutUntrusted),
    () => bar.current?.querySelector<HTMLElement>(`[${firstAnswerAttribute}] button`) ?? null,
  );

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (state.kind === "answered") answered.current?.focus();
  }, [state.kind]);
  // An answer in flight or recorded here is this card's own, so only an open card turns stale.
  const stale = props.waiting === false && state.kind === "open";
  const section = useRef<HTMLElement>(null);
  const live = state.kind !== "answered" && !stale;
  const openRun = props.onOpenRun === undefined ? undefined : () => props.onOpenRun?.(item.runId);

  async function answer(event: string) {
    if (!guard.allows() || state.kind !== "open") return;
    setState({ kind: "answering", event });
    try {
      await decisions.answer(item, event);
      setState({ kind: "answered", event, at: now() });
    } catch (error) {
      setState({
        kind: "open",
        failed: event,
        elsewhere: wasDecidedElsewhere(error),
        manual: manualAnswerOf(error),
        detail: failureDetailOf(error),
        untrusted: wasRefusedUntrusted(error),
      });
    }
  }

  return (
    <section ref={section} aria-labelledby={titleId} className={cardClasses}>
      <div className={cardBodyClasses}>
        <CardHeader
          titleId={titleId}
          // Filled in from the run's context, so it can hold model output: mark what's hidden.
          title={markHiddenName(item.title)}
          heading={heading}
          since={live ? waitingSince(new Date(item.since), now()) : null}
          startedBy={props.startedBy}
          onOpenRun={openRun}
        />
        {item.body === "" ? null : (
          <div
            className={
              live ? "text-body" : "rounded-sm border border-dashed border-border p-3 text-fg-muted"
            }
          >
            <PlainValue text={item.body} />
          </div>
        )}
        {item.movesOnAt === null || !live ? null : (
          <p className="text-small text-fg-muted">{movesOnLine(new Date(item.movesOnAt))}</p>
        )}
      </div>
      {stale ? <StaleBar card={section} openRun={openRun} /> : null}
      {!stale && state.kind === "answered" ? (
        <DecidedBar
          text={answeredText(state.event, state.at, ownLabel(item.answerLabels, state.event))}
          next={next}
          back={back}
          callout={answered}
        />
      ) : null}
      {!stale && state.kind !== "answered" ? (
        <AnswerBar
          accepts={item.accepts}
          labels={item.answerLabels}
          state={state}
          guard={guard}
          engine={props}
          onAnswer={answer}
          onOpenRun={openRun}
          onReviewTrust={props.trust?.review}
          bar={bar}
        />
      ) : null}
    </section>
  );
}

interface AnswerBarProps {
  readonly accepts: readonly string[];
  readonly labels: Readonly<Record<string, string>>;
  readonly state: Exclude<CardState, { kind: "answered" }>;
  readonly guard: DecisionGuard;
  readonly engine: EngineState;
  readonly onAnswer: (event: string) => void;
  readonly onOpenRun: (() => void) | undefined;
  readonly onReviewTrust: ((opener: HTMLElement | null) => void) | undefined;
  readonly bar: RefObject<HTMLDivElement | null>;
}

/**
 * The bar under the card: the first answer primary and full width, the others secondary sharing
 * a row under it, none red (flow-inbox 5.1, first-run 4.3). While one is sent it is busy and the
 * others ignore presses but keep focus.
 *
 * A step's label has no length limit, so a button keeps it on one line and ends it with an
 * ellipsis at its edge, with the whole label as its name, and as its tooltip only when cut off
 * (HAL-4050, HAL-12721 L15). Each button sits in a `@container` as wide as the button, so the label can be
 * capped at that width less the button's widest padding and edges.
 */
function AnswerBar({
  accepts,
  labels,
  state,
  guard,
  engine,
  onAnswer,
  onOpenRun,
  onReviewTrust,
  bar,
}: AnswerBarProps) {
  const reasonId = useId();
  const unavailable = unavailableWhile(engine.answering ?? true, reasonId);
  const [first, ...others] = accepts;
  const failed = state.kind === "open" ? state.failed : null;
  const answerButton = (event: string, primary: boolean) => (
    <AnswerButton
      key={event}
      label={answerLabel(event, ownLabel(labels, event))}
      busyLabel={busyLabel(event, ownLabel(labels, event))}
      primary={primary}
      unavailable={unavailable}
      busy={state.kind === "answering" && state.event === event}
      onClick={() => onAnswer(event)}
    />
  );
  return (
    <div
      ref={bar}
      className="flex flex-col gap-2 border-t border-border p-4"
      onPointerDownCapture={guard.onPointerDownCapture}
      onKeyDownCapture={guard.onKeyDownCapture}
    >
      <NotAnsweringLine id={reasonId} {...engine} />
      <FailedLine
        onRetry={failed === null ? null : () => onAnswer(failed)}
        detail={state.kind === "open" ? state.detail : null}
        manual={state.kind === "open" ? state.manual : null}
        elsewhere={state.kind === "open" && state.elsewhere ? { openRun: onOpenRun } : null}
        untrusted={state.kind === "open" && state.untrusted ? { review: onReviewTrust } : null}
      />
      {first === undefined ? null : answerButton(first, true)}
      {others.length === 0 ? null : (
        <div className="flex gap-2">{others.map((event) => answerButton(event, false))}</div>
      )}
    </div>
  );
}

interface AnswerButtonProps {
  readonly label: string;
  readonly busyLabel: string;
  readonly primary: boolean;
  readonly unavailable: ButtonUnavailable | undefined;
  readonly busy: boolean;
  readonly onClick: () => void;
}

/** Marks the first answer's box, which takes focus once the workspace is trusted. */
const firstAnswerAttribute = "data-first-answer";

/** One answer's button, whose tooltip shows the whole label only when the button cuts it off. */
function AnswerButton({
  label,
  busyLabel,
  primary,
  unavailable,
  busy,
  onClick,
}: AnswerButtonProps) {
  const shown = useRef<HTMLSpanElement>(null);
  return (
    // `[&>span]:flex` makes the tooltip's wrapper as wide as the container, as is the button.
    <div
      className="@container min-w-0 flex-1 [&>span]:flex"
      {...(primary ? { [firstAnswerAttribute]: "" } : {})}
    >
      <Tooltip
        text={label}
        isName
        showIf={() =>
          shown.current !== null && shown.current.scrollWidth > shown.current.clientWidth
        }
      >
        {(tooltip) => (
          <Button
            {...tooltip}
            variant={primary ? "primary" : "secondary"}
            block
            unavailable={unavailable}
            busy={busy}
            busyLabel={busyLabel}
            onClick={onClick}
          >
            <span ref={shown} className="max-w-[calc(100cqw-2rem-2px)] truncate">
              {label}
            </span>
          </Button>
        )}
      </Tooltip>
    </div>
  );
}
