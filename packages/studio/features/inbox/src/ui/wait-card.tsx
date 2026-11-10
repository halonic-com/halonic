import { Button, type CalloutHandle } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { InboxDecisions } from "../decide.ts";
import type { WaitItem } from "../inbox-items.ts";
import { markedName } from "../plain/hidden-characters.ts";
import { decidedAt, movesOnLine, waitingSince } from "../plain/waiting-time.ts";
import {
  type BackLink,
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
  /** Where you came from, for **Back to run** or **Back to the chat**; `null` from the Inbox itself. */
  readonly back: BackLink | null;
  /** The clock, so a test can set it. */
  readonly now?: () => Date;
}

type CardState =
  | { readonly kind: "open"; readonly failed: string | null }
  | { readonly kind: "answering"; readonly event: string }
  | { readonly kind: "answered"; readonly event: string; readonly at: Date };

/**
 * An answer's label, on its button and in the decided line alike: the step's own label when it
 * has one, with hidden characters marked, else "Approve" and "Reject", else the event's name in
 * words with a capital first letter, `needs_info` as "Needs info".
 */
export function answerLabel(event: string, own?: string): string {
  if (own !== undefined && own.trim() !== "") return markedName(own.trim());
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
 * The decided Callout of a wait step (mc 5). Its reject is the step's own answer, so it says
 * nothing about a tool call or the agent. Any other answer, and any answer the step labels
 * itself, names the button you pressed with the same word (HAL-4008).
 */
export function answeredText(event: string, at: Date, own?: string): string {
  const time = decidedAt(at);
  const label = answerLabel(event, own);
  if (label === answerLabel(event)) {
    if (event === "approve") return `Approved by you at ${time}. The run continues.`;
    if (event === "reject") return `Rejected by you at ${time}.`;
  }
  return `You chose ${label} at ${time}.`;
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
        <DecidedBar
          text={answeredText(state.event, state.at, ownLabel(item.answerLabels, state.event))}
          next={next}
          back={back}
          callout={answered}
        />
      ) : (
        <AnswerBar
          accepts={item.accepts}
          labels={item.answerLabels}
          state={state}
          guard={guard}
          onAnswer={answer}
        />
      )}
    </section>
  );
}

interface AnswerBarProps {
  readonly accepts: readonly string[];
  readonly labels: Readonly<Record<string, string>>;
  readonly state: Exclude<CardState, { kind: "answered" }>;
  readonly guard: DecisionGuard;
  readonly onAnswer: (event: string) => void;
}

/**
 * The bar under the card: the first answer primary and full width, the others secondary in a
 * row under it, none red (flow-inbox 5.1, first-run 4.3). While one is sent it is busy and the
 * others ignore presses but keep focus.
 */
function AnswerBar({ accepts, labels, state, guard, onAnswer }: AnswerBarProps) {
  const [first, ...others] = accepts;
  const failed = state.kind === "open" ? state.failed : null;
  const answerButton = (event: string, primary: boolean) => (
    <Button
      key={event}
      variant={primary ? "primary" : "secondary"}
      block
      busy={state.kind === "answering" && state.event === event}
      busyLabel={busyLabel(event, ownLabel(labels, event))}
      onClick={() => onAnswer(event)}
    >
      {answerLabel(event, ownLabel(labels, event))}
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
