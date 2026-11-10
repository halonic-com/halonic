import { Button, type CalloutHandle } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { InboxDecisions } from "../decide.ts";
import type { WaitItem } from "../inbox-items.ts";
import { markedName } from "../plain/hidden-characters.ts";
import { decidedAt, movesOnLine, waitingSince } from "../plain/waiting-time.ts";
import {
  CardHeader,
  DecidedBar,
  FailedLine,
  type NextItem,
  useEveryMinute,
} from "./card-parts.tsx";
import { type DecisionGuard, useDecisionGuard } from "./decision-guard.ts";
import { PlainValue } from "./plain-value.tsx";

export interface WaitCardProps {
  readonly item: WaitItem;
  readonly decisions: Pick<InboxDecisions, "answer">;
  readonly onOpenRun: (runId: string) => void;
  /** The next item, or `null` when nothing else is waiting. */
  readonly next: NextItem | null;
  /** The clock, so a test can set it. */
  readonly now?: () => Date;
}

type CardState =
  | { readonly kind: "open"; readonly failed: string | null }
  | { readonly kind: "answering"; readonly event: string }
  | { readonly kind: "answered"; readonly event: string; readonly at: Date };

/**
 * An answer's button label: "Approve" and "Reject", else the event's name in words with a
 * capital first letter, `needs_info` as "Needs info".
 */
export function answerLabel(event: string): string {
  const words = event.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function busyLabel(event: string): string {
  if (event === "approve") return "Approving…";
  if (event === "reject") return "Rejecting…";
  return "Working…";
}

/**
 * The decided Callout of a wait step (mc 5). Its reject is the step's own answer, so it says
 * nothing about a tool call or the agent; any other answer names the button you pressed.
 */
export function answeredText(event: string, at: Date): string {
  const time = decidedAt(at);
  if (event === "approve") return `Approved by you at ${time}. The run continues.`;
  if (event === "reject") return `Rejected by you at ${time}.`;
  return `You chose ${answerLabel(event)} at ${time}.`;
}

/**
 * The card for a run waiting at a `wait` step (`inbox.wait-card`), such as Acme's "Approve this
 * reply?": the step's first line as its title, the rest as plain text, the timer line if the
 * step has one, and a button per answer the step takes, the first one primary and full width,
 * none red. It has the approval card's 1 s guard, and is replaced in place once answered.
 */
export function WaitCard(props: WaitCardProps) {
  const { item, decisions, next } = props;
  const now = props.now ?? (() => new Date());
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const answered = useRef<CalloutHandle>(null);
  const [state, setState] = useState<CardState>({ kind: "open", failed: null });
  const [usableAt] = useState(() => now().getTime());
  const guard = useDecisionGuard(usableAt, () => now().getTime());
  useEveryMinute();

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (state.kind === "answered") answered.current?.focus();
  }, [state.kind]);

  async function answer(event: string) {
    if (!guard.allows() || state.kind !== "open") return;
    setState({ kind: "answering", event });
    try {
      await decisions.answer(item, event);
      setState({ kind: "answered", event, at: now() });
    } catch {
      setState({ kind: "open", failed: event });
    }
  }

  return (
    <section aria-labelledby={titleId} className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <CardHeader
          titleId={titleId}
          // Filled in from the run's context, so it can hold model output: mark what's hidden.
          title={markedName(item.title)}
          heading={heading}
          since={state.kind === "answered" ? null : waitingSince(new Date(item.since), now())}
          onOpenRun={() => props.onOpenRun(item.runId)}
        />
        {item.body === "" ? null : (
          <div
            className={
              state.kind === "answered"
                ? "rounded-sm border border-dashed border-border p-3 text-fg-muted"
                : "text-body"
            }
          >
            <PlainValue text={item.body} />
          </div>
        )}
        {item.movesOnAt === null || state.kind === "answered" ? null : (
          <p className="text-small text-fg-muted">{movesOnLine(new Date(item.movesOnAt))}</p>
        )}
      </div>
      {state.kind === "answered" ? (
        <DecidedBar text={answeredText(state.event, state.at)} next={next} callout={answered} />
      ) : (
        <AnswerBar accepts={item.accepts} state={state} guard={guard} onAnswer={answer} />
      )}
    </section>
  );
}

interface AnswerBarProps {
  readonly accepts: readonly string[];
  readonly state: Exclude<CardState, { kind: "answered" }>;
  readonly guard: DecisionGuard;
  readonly onAnswer: (event: string) => void;
}

/**
 * The bar under the card: the first answer primary and full width, the others secondary in a
 * row under it, none red (flow-inbox 5.1, first-run 4.3). While one is sent it is busy and the
 * others ignore presses but keep focus.
 */
function AnswerBar({ accepts, state, guard, onAnswer }: AnswerBarProps) {
  const [first, ...others] = accepts;
  const failed = state.kind === "open" ? state.failed : null;
  const answerButton = (event: string, primary: boolean) => (
    <Button
      key={event}
      variant={primary ? "primary" : "secondary"}
      block
      busy={state.kind === "answering" && state.event === event}
      busyLabel={busyLabel(event)}
      onClick={() => onAnswer(event)}
    >
      {answerLabel(event)}
    </Button>
  );
  return (
    <div
      className="flex flex-col gap-2 border-t border-border p-4"
      onPointerDownCapture={guard.onPointerDownCapture}
      onKeyDownCapture={guard.onKeyDownCapture}
    >
      <FailedLine onRetry={failed === null ? null : () => onAnswer(failed)} />
      {first === undefined ? null : answerButton(first, true)}
      {others.length === 0 ? null : (
        <div className="flex gap-2">{others.map((event) => answerButton(event, false))}</div>
      )}
    </div>
  );
}
