import { type PlanUnitStop, planRunOf } from "@halonicjs/app/run-failure";
import type { RunSummary } from "@halonicjs/events";
import { Button, type CalloutHandle, StatusChip, waitingSince } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import { type AfterAnswer, afterAnswer, type InboxDecisions } from "../decide.ts";
import type { WaitItem } from "../inbox-items.ts";
import { planLimitWords, stillAtLimitLine, unitMessage } from "../plain/plan-limit-words.ts";
import {
  CardHeader,
  cardBodyClasses,
  cardClasses,
  type EngineState,
  FailedLine,
  failureDetailOf,
  NotAnsweringLine,
  StaleBar,
  unavailableWhile,
  useEveryMinute,
  wasDecidedElsewhere,
} from "./card-parts.tsx";
import { DecidedBar, type NextItem } from "./decided-bar.tsx";

/** What {@link PlanLimitCard} shows: a run waiting at a plan limit. */
export interface PlanLimitCardProps extends EngineState {
  readonly item: WaitItem & { readonly limit: PlanUnitStop };
  readonly decisions: Pick<InboxDecisions, "answer">;
  /** Opens the run; without it the card has no **Open run**. */
  readonly onOpenRun?: ((runId: string) => void) | undefined;
  /** What started the run, after "Started by" in the header; without it the card has no such line. */
  readonly startedBy?: string | undefined;
  /** Opens the customer's usage, the account page's plan; without it there's no **See usage**. */
  readonly onSeeUsage?: (() => void) | undefined;
  /** Says a line where a screen reader hears it: "This run is still at your plan's limit…" after a Continue that changed nothing. */
  readonly announce?: ((line: string) => void) | undefined;
  /** The next item, or `null` when nothing else is waiting. */
  readonly next: NextItem | null;
  /** The clock, so a test can set it. */
  readonly now?: () => Date;
  /** `false` once the run no longer waits here, such as continued from another window. */
  readonly waiting?: boolean;
}

type CardState =
  | {
      readonly kind: "open";
      /** **Continue the run** failed: the failure's own sentence, or `null` for none. */
      readonly failed: { readonly detail: string | null; readonly elsewhere: boolean } | null;
      /** **Continue the run** left the run waiting at its limit: the line that says so, or `null`. */
      readonly atLimitLine: string | null;
    }
  | { readonly kind: "continuing" }
  | { readonly kind: "continued"; readonly after: AfterAnswer };

/**
 * The card for a run waiting at a plan limit (`inbox.plan-limit-card`, flow C3 as board 10 draws
 * it): the chip "Waiting: plan limit reached", C3's title and line, **Continue the run** and
 * **See usage**. Continue is always there: when there's still no room the run waits again at the
 * same stop, and the card stays as it was, with no new error, and says so in a quiet line.
 */
export function PlanLimitCard(props: PlanLimitCardProps) {
  const { item } = props;
  const now = props.now ?? (() => new Date());
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const continued = useRef<CalloutHandle>(null);
  const section = useRef<HTMLElement>(null);
  const [state, setState] = useState<CardState>({ kind: "open", failed: null, atLimitLine: null });
  const message = unitMessage(item.limit);
  useEveryMinute();
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (state.kind === "continued") continued.current?.focus();
  }, [state.kind]);
  const stale = props.waiting === false && state.kind === "open";
  const live = state.kind !== "continued" && !stale;
  const openRun = props.onOpenRun === undefined ? undefined : () => props.onOpenRun?.(item.runId);

  async function continueRun() {
    if (state.kind === "continuing") return;
    setState({ kind: "continuing" });
    let run: RunSummary;
    try {
      run = await props.decisions.answer(item, "continue");
    } catch (error) {
      const failed = { detail: failureDetailOf(error), elsewhere: wasDecidedElsewhere(error) };
      setState({ kind: "open", failed, atLimitLine: null });
      return;
    }
    if (!stillAtLimit(run)) {
      setState({ kind: "continued", after: afterAnswer(run) });
      return;
    }
    // The press needs an answer, or the button reads as broken (Noah, HAL-19110).
    const line = stillAtLimitLine(planRunOf(run)?.stop ?? item.limit);
    setState({ kind: "open", failed: null, atLimitLine: line });
    props.announce?.(line);
  }

  return (
    <section ref={section} aria-labelledby={titleId} className={cardClasses}>
      <div className={cardBodyClasses}>
        <span className="flex">
          <StatusChip tone="neutral">{planLimitWords.waitingChip}</StatusChip>
        </span>
        <CardHeader
          titleId={titleId}
          title={message.title}
          heading={heading}
          since={live ? waitingSince(new Date(item.since), now()) : null}
          startedBy={props.startedBy}
          onOpenRun={openRun}
        />
        {message.line === "" ? null : (
          <p className={live ? "text-body" : "text-body text-fg-muted"}>{message.line}</p>
        )}
      </div>
      {stale ? <StaleBar card={section} openRun={openRun} /> : null}
      {!stale && state.kind === "continued" ? (
        <DecidedBar
          text={afterText(state.after)}
          next={props.next}
          back={null}
          callout={continued}
        />
      ) : null}
      {!stale && state.kind !== "continued" ? (
        <ContinueBar
          state={state}
          engine={props}
          onContinue={() => void continueRun()}
          onSeeUsage={props.onSeeUsage}
          onOpenRun={openRun}
        />
      ) : null}
    </section>
  );
}

/** Whether `continue` left the run waiting at a plan limit, because there's still no room. */
function stillAtLimit(run: RunSummary): boolean {
  return planRunOf(run)?.state === "waiting";
}

/** The line once the run went on, as the wait card says it after an answer. */
function afterText(after: AfterAnswer): string {
  if (after === "continues") return planLimitWords.continues;
  return after === "finished" ? planLimitWords.finished : planLimitWords.ended;
}

interface ContinueBarProps {
  readonly state: Exclude<CardState, { kind: "continued" }>;
  readonly engine: EngineState;
  readonly onContinue: () => void;
  readonly onSeeUsage: (() => void) | undefined;
  readonly onOpenRun: (() => void) | undefined;
}

/** The bar: **Continue the run** primary and full width, then **See usage**; no Upgrade in S3. */
function ContinueBar({ state, engine, onContinue, onSeeUsage, onOpenRun }: ContinueBarProps) {
  const reasonId = useId();
  const unavailable = unavailableWhile(engine.answering ?? true, reasonId);
  const failed = state.kind === "open" ? state.failed : null;
  const atLimitLine = state.kind === "open" ? state.atLimitLine : null;
  return (
    <div className="flex flex-col gap-2 border-t border-border p-4">
      <NotAnsweringLine id={reasonId} {...engine} />
      {atLimitLine === null ? null : <p className="text-small text-fg-muted">{atLimitLine}</p>}
      <FailedLine
        onRetry={failed === null || failed.elsewhere ? null : onContinue}
        detail={failed?.detail ?? null}
        elsewhere={failed?.elsewhere === true ? { openRun: onOpenRun } : null}
      />
      <Button
        variant="primary"
        block
        unavailable={unavailable}
        busy={state.kind === "continuing"}
        busyLabel={planLimitWords.continuing}
        onClick={onContinue}
      >
        {planLimitWords.continueRun}
      </Button>
      {onSeeUsage === undefined ? null : (
        <Button block onClick={onSeeUsage}>
          {planLimitWords.seeUsage}
        </Button>
      )}
    </div>
  );
}
