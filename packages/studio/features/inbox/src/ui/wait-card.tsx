import { isHostTooOld } from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";
import { sampleAnswersWord } from "@halonicjs/studio-feature-runs/api";
import {
  Button,
  type ButtonUnavailable,
  type CalloutHandle,
  movesOnLine,
  StatusChip,
  Tooltip,
  usePresentation,
  waitingSince,
} from "@halonicjs/studio-kit";
import { engineWords, type ViewRef } from "@halonicjs/studio-shell";
import {
  type ReactNode,
  type RefCallback,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { type AfterAnswer, afterAnswer, type InboxDecisions } from "../decide.ts";
import type { WaitItem } from "../inbox-items.ts";
import { answeredText, answerLabel, busyLabel, ownLabel } from "../plain/answer-text.ts";
import { AnsweredView, type AnsweredViews, claimedView } from "./answered-view.tsx";
import {
  CardHeader,
  cardBodyClasses,
  cardClasses,
  type EngineState,
  FailedLine,
  failureDetailOf,
  type ManualAnswer,
  manualAnswerOf,
  NotAnsweringLine,
  StaleBar,
  unavailableWhile,
  useEveryMinute,
  wasDecidedElsewhere,
  wasRefusedUntrusted,
} from "./card-parts.tsx";
import { type BackLink, DecidedBar, type NextItem } from "./decided-bar.tsx";
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
  /**
   * The run's replies came from the test model (`runs.sample-chip`): the card carries the
   * "Sample answers" chip above its title. `false` when left out.
   */
  readonly sample?: boolean;
  /**
   * The views that may take the card's place once answered (`Inbox.addAnsweredView`), and what
   * they get to close or open with. Without it, or when none claims the answer, the card keeps its
   * decided bar.
   */
  readonly answeredViews?: AnsweredViews | undefined;
}

type CardState =
  | {
      readonly kind: "open";
      readonly failed: string | null;
      /** The answer was refused because the run isn't waiting at this step any more. */
      readonly elsewhere: boolean;
      readonly manual: ManualAnswer | null;
      /** The host is too old to check which wait step the answer is for, so it wasn't sent. */
      readonly tooOld: boolean;
      /** The failure's own sentence, shown after "Couldn't record your decision.". */
      readonly detail: string | null;
      /** The answer was refused because the workspace isn't trusted. */
      readonly untrusted: boolean;
    }
  | { readonly kind: "answering"; readonly event: string }
  | {
      readonly kind: "answered";
      readonly event: string;
      readonly at: Date;
      readonly after: AfterAnswer;
      /** The view that claimed the answer, in the card's place; none keeps the decided bar. */
      readonly view: ViewRef | undefined;
    };

/**
 * The card for a run waiting at a `wait` step (`inbox.wait-card`), such as Acme's "Approve this
 * reply?": the step's first line as its title, the rest as plain text, the timer line if the
 * step has one, and a button per answer the step takes, the first one primary, none red. It has
 * the approval card's 1 s guard, and is replaced in place once answered.
 */
export function WaitCard(props: WaitCardProps) {
  const { item, decisions, next, back } = props;
  const now = props.now ?? (() => new Date());
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const answered = useRef<CalloutHandle>(null);
  const phone = usePresentation() === "phone";
  const [state, setState] = useState<CardState>({
    kind: "open",
    failed: null,
    elsewhere: false,
    manual: null,
    tooOld: false,
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
    let after: AfterAnswer;
    try {
      after = afterAnswer(await decisions.answer(item, event));
    } catch (error) {
      setState({
        kind: "open",
        failed: event,
        elsewhere: wasDecidedElsewhere(error),
        manual: manualAnswerOf(error),
        tooOld: isHostTooOld(error),
        detail: failureDetailOf(error),
        untrusted: wasRefusedUntrusted(error),
      });
      return;
    }
    // Outside the `try`: the answer is recorded by now, so a view that fails to claim it must not
    // reopen the card for a second answer.
    const view = claimedView(props.answeredViews, item, event, after);
    setState({ kind: "answered", event, at: now(), after, view });
  }

  const card = (
    <section ref={section} aria-labelledby={titleId} className={cardClasses}>
      <div className={cardBodyClasses}>
        <SampleAnswersChip shown={props.sample === true} />
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
          text={answeredText(
            state.event,
            state.at,
            state.after,
            ownLabel(item.answerLabels, state.event),
            phone,
          )}
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
          trust={props.trust}
          bar={bar}
        />
      ) : null}
    </section>
  );
  return withClaimedView(card, state, item, props.answeredViews);
}

/** The card, or the view that claimed its answer in its place (`inbox.answered-view`). */
function withClaimedView(
  card: ReactNode,
  state: CardState,
  item: WaitItem,
  views: AnsweredViews | undefined,
): ReactNode {
  if (state.kind !== "answered" || state.view === undefined || views === undefined) return card;
  return (
    <AnsweredView
      view={state.view}
      props={{ item, close: views.close, openItem: views.openItem }}
      fallback={card}
    />
  );
}

/** The "Sample answers" chip above the title, on its own line (`runs.sample-chip`). */
function SampleAnswersChip({ shown }: { readonly shown: boolean }) {
  if (!shown) return null;
  return (
    <span className="flex">
      <StatusChip tone="outline">{sampleAnswersWord}</StatusChip>
    </span>
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
  readonly trust: TrustReview | undefined;
  readonly bar: RefObject<HTMLDivElement | null>;
}

/**
 * The bar under the card, none red (flow-inbox 5.1, first-run 4.3). On a phone the first answer is
 * primary and full width, the others secondary sharing a row under it. On a desktop they sit in one
 * right-aligned row at their natural width with the first at the right end, as Approve is on the
 * approval card (HAL-19399 G8): stretched across a 730 px pane they read as one bar. While one is sent it is busy and the others ignore presses but
 * keep focus.
 *
 * A step's label has no length limit, so a button keeps it on one line and ends it with an
 * ellipsis at its edge, with the whole label as its name, and as its tooltip only when cut off
 * (HAL-4050, HAL-12721 L15). The label is capped at its `@container`'s width less the button's
 * widest padding and edges: on a phone each button's own box, on a desktop the row's.
 */
function AnswerBar({
  accepts,
  labels,
  state,
  guard,
  engine,
  onAnswer,
  onOpenRun,
  trust,
  bar,
}: AnswerBarProps) {
  const reasonId = useId();
  const unavailable = unavailableWhile(engine.answering ?? true, reasonId);
  const failed = state.kind === "open" ? state.failed : null;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const phone = usePresentation() === "phone";
  // **Try again** leaves the alert slot while the answer is sent, so it hands focus to the
  // answer's own button, busy until the answer comes back, rather than to the page (C560).
  const retry = (event: string) => {
    buttons.current.get(event)?.focus();
    onAnswer(event);
  };
  const answerButton = (event: string, primary: boolean) => (
    <AnswerButton
      key={event}
      buttonRef={(element) => {
        if (element === null) buttons.current.delete(event);
        else buttons.current.set(event, element);
      }}
      label={answerLabel(event, ownLabel(labels, event))}
      busyLabel={busyLabel(event, ownLabel(labels, event))}
      primary={primary}
      fill={phone}
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
        onRetry={failed === null ? null : () => retry(failed)}
        detail={state.kind === "open" ? state.detail : null}
        manual={state.kind === "open" ? state.manual : null}
        elsewhere={state.kind === "open" && state.elsewhere ? { openRun: onOpenRun } : null}
        tooOld={
          state.kind === "open" && state.tooOld
            ? (engine.words ?? engineWords["desktop-app"]).tooOldToAnswer
            : null
        }
        untrusted={
          state.kind === "open" && state.untrusted ? (trust ?? { review: undefined }) : null
        }
      />
      <AnswerButtons events={accepts} phone={phone} button={answerButton} />
    </div>
  );
}

/**
 * The answers' buttons: on a phone the first full width over a row of the others, on a desktop one
 * right-aligned row of the others then the first (HAL-19399 G8). Last in the DOM, not reversed by
 * CSS, so Tab goes the way the eye does.
 */
function AnswerButtons({
  events,
  phone,
  button,
}: {
  readonly events: readonly string[];
  readonly phone: boolean;
  readonly button: (event: string, primary: boolean) => ReactNode;
}) {
  const [first, ...others] = events;
  if (first === undefined) return null;
  if (!phone) {
    return (
      <div className="@container flex flex-wrap justify-end gap-2">
        {others.map((event) => button(event, false))}
        {button(first, true)}
      </div>
    );
  }
  return (
    <>
      {button(first, true)}
      {others.length === 0 ? null : (
        <div className="flex gap-2">{others.map((event) => button(event, false))}</div>
      )}
    </>
  );
}

interface AnswerButtonProps {
  /** Given the button, so **Try again** can move focus to the answer it sends again. */
  readonly buttonRef: RefCallback<HTMLButtonElement>;
  readonly label: string;
  readonly busyLabel: string;
  readonly primary: boolean;
  /** On a phone: the button fills its share of the row and is its label's `@container`. */
  readonly fill: boolean;
  readonly unavailable: ButtonUnavailable | undefined;
  readonly busy: boolean;
  readonly onClick: () => void;
}

/** Marks the first answer's box, which takes focus once the workspace is trusted. */
const firstAnswerAttribute = "data-first-answer";

/** One answer's button, whose tooltip shows the whole label only when the button cuts it off. */
function AnswerButton({
  buttonRef,
  label,
  busyLabel,
  primary,
  fill,
  unavailable,
  busy,
  onClick,
}: AnswerButtonProps) {
  const shown = useRef<HTMLSpanElement>(null);
  return (
    // `[&>span]:flex` makes the tooltip's wrapper as wide as the box, as is the button.
    <div
      className={`${fill ? "@container flex-1" : "max-w-full"} min-w-0 [&>span]:flex`}
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
            ref={buttonRef}
            variant={primary ? "primary" : "secondary"}
            block={fill}
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
