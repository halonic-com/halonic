import { Button, inlineLinkClasses } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useId, useRef } from "react";
import {
  beforeAcceptLines,
  changedSinceRunLine,
  changeLine,
  decidedSummary,
  decisionFailedLine,
  proposalFacts,
  seeRunText,
} from "../plain/proposal-text.ts";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import type { ProposalFile, ProposalItem } from "../proposal-items.ts";
import { cardBodyClasses, cardClasses } from "./card-parts.tsx";
import { itemTitle } from "./inbox-row.tsx";
import type { RunFacts } from "./run-facts.ts";
import {
  type DecisionTarget,
  type ProposalDecisionState,
  type ProposalVerb,
  useProposalDecisions,
} from "./use-proposal-decisions.ts";

/** What {@link ProposalCard} shows. */
export interface ProposalCardProps {
  readonly item: ProposalItem;
  readonly now: Date;
  /** The run's workflow and starter, from the Runs list; `undefined` while it doesn't have the run. */
  readonly facts: RunFacts | undefined;
  /** Accept and Reject; without them the page shows the changes and no buttons. */
  readonly decisions: ProposalDecisions | undefined;
  /** After each decision or Undo, so the Inbox reads its items again and the count drops. */
  readonly onDecided: () => void;
  readonly onOpenRun?: ((runId: string) => void) | undefined;
}

/**
 * A run proposal opened from Needs you (flow-inbox 2.2, HAL-11945 Q3 to Q7): the row's title, the
 * workflow, when the run ended and what started it, with **Reject all** and **Accept all**; then
 * what accepting does, before any Accept, and one line per change with **Reject** and **Accept**.
 * A decided line says so in place of its buttons, and focus moves to the next **Accept**, else to
 * what the proposal came to.
 *
 * Not here yet: a change's settings before and after, the diff, Compare and the phone's bar (Q5,
 * Q9, Q12).
 */
export function ProposalCard({
  item,
  now,
  facts,
  decisions,
  onDecided,
  onOpenRun,
}: ProposalCardProps) {
  const titleId = useId();
  const state = useProposalDecisions(item, decisions, onDecided);
  const open = state.files.filter(
    (file) => file.decision === "undecided" && !state.changedSinceRun.has(file.path),
  );
  const { accepts, summary } = useFocusAfterDecision(state, open[0]?.path);
  return (
    <section aria-labelledby={titleId} className={cardClasses}>
      <div className={cardBodyClasses}>
        <ProposalHeader
          item={item}
          titleId={titleId}
          facts={proposalFacts(item, now, facts)}
          state={decisions !== undefined && open.length > 0 ? state : null}
        />
        <FailedLine state={state} target="all" />
        <BeforeAccept item={item} onOpenRun={onOpenRun} />
        <ul className="flex flex-col gap-2">
          {state.files.map((file) => (
            <ChangeRow
              key={file.path}
              file={file}
              runId={item.runId}
              state={state}
              buttons={decisions !== undefined}
              accepts={accepts}
            />
          ))}
        </ul>
        {open.length === 0 && state.decided > 0 ? (
          <p ref={summary} tabIndex={-1} className="focus-ring text-body text-fg">
            {decidedSummary(state.files)}
          </p>
        ) : null}
        <p role="status" className="sr-only">
          {state.announcement}
        </p>
      </div>
    </section>
  );
}

/**
 * Q6: once a decision is back, focus goes to the next undecided **Accept**, else to what the
 * proposal came to. A failed one leaves it on its button, by its **Try again**.
 */
function useFocusAfterDecision(state: ProposalDecisionState, nextPath: string | undefined) {
  const accepts = useRef(new Map<string, HTMLButtonElement>());
  const summary = useRef<HTMLParagraphElement>(null);
  const { decided, failure } = state;
  useEffect(() => {
    if (decided === 0 || failure !== null) return;
    const next = nextPath === undefined ? summary.current : accepts.current.get(nextPath);
    next?.focus();
  }, [decided, failure, nextPath]);
  return { accepts, summary };
}

/**
 * The title, which takes focus when the page opens, the run's facts under it, and **Reject all**
 * and **Accept all** while something is left to decide (`state`, else `null`).
 */
function ProposalHeader({
  item,
  titleId,
  facts,
  state,
}: {
  readonly item: ProposalItem;
  readonly titleId: string;
  readonly facts: string;
  readonly state: ProposalDecisionState | null;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  return (
    <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-40">
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          className="focus-ring text-title text-fg wrap-break-word"
        >
          {itemTitle(item)}
        </h2>
        <p className="text-small text-fg-muted">{facts}</p>
      </div>
      {state === null ? null : <AllButtons state={state} />}
    </header>
  );
}

/** **Reject all** and **Accept all** (Q3): one undo step each, for what is still undecided. */
function AllButtons({ state }: { readonly state: ProposalDecisionState }) {
  return (
    <div className="ml-auto flex flex-wrap gap-2">
      <DecideButton state={state} verb="reject" target="all" label="Reject all" />
      <DecideButton state={state} verb="accept" target="all" label="Accept all" />
    </div>
  );
}

/** The lines before any Accept (Q4), above the changes, with **See run 01JD8Q ›**. */
function BeforeAccept({
  item,
  onOpenRun,
}: {
  readonly item: ProposalItem;
  readonly onOpenRun: ((runId: string) => void) | undefined;
}) {
  const lines = beforeAcceptLines(item);
  return (
    <div className="flex flex-col gap-1 text-body text-fg-muted">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {onOpenRun === undefined ? null : (
        <p>
          <button type="button" className={inlineLinkClasses} onClick={() => onOpenRun(item.runId)}>
            {seeRunText(item.runId)}
            <span aria-hidden="true"> ›</span>
          </button>
        </p>
      )}
    </div>
  );
}

const decidedWords: Partial<Record<ProposalFile["decision"], string>> = {
  accepted: "Accepted",
  rejected: "Rejected",
  "not-applicable": "Can't be written",
};

/** One change (Q5, Q6): its line, then **Reject** and **Accept**, or what was decided, muted. */
function ChangeRow({
  file,
  runId,
  state,
  buttons,
  accepts,
}: {
  readonly file: ProposalFile;
  readonly runId: string;
  readonly state: ProposalDecisionState;
  readonly buttons: boolean;
  readonly accepts: RefObject<Map<string, HTMLButtonElement>>;
}) {
  const decided = decidedWords[file.decision];
  const changedSinceRun = state.changedSinceRun.has(file.path);
  const target = { file: file.path };
  const acceptRef = (button: HTMLButtonElement | null) => {
    if (button === null) accepts.current.delete(file.path);
    else accepts.current.set(file.path, button);
  };
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 text-body wrap-break-word">{changeLine(file)}</span>
        {decided === undefined && buttons && !changedSinceRun ? (
          <span className="flex gap-2">
            <DecideButton state={state} verb="reject" target={target} label="Reject" />
            <DecideButton
              state={state}
              verb="accept"
              target={target}
              label="Accept"
              buttonRef={acceptRef}
            />
          </span>
        ) : null}
        {decided === undefined ? null : <span className="text-small text-fg-muted">{decided}</span>}
      </div>
      {changedSinceRun ? (
        <p className="text-small text-fg-muted">{changedSinceRunLine(runId)}</p>
      ) : null}
      <FailedLine state={state} target={target} />
    </li>
  );
}

/**
 * A decision's button (Q6): busy while it is sent, keeping focus; while another is sent it
 * ignores presses but stays where it is.
 */
function DecideButton({
  state,
  verb,
  target,
  label,
  buttonRef,
}: {
  readonly state: ProposalDecisionState;
  readonly verb: ProposalVerb;
  readonly target: DecisionTarget;
  readonly label: string;
  readonly buttonRef?: (button: HTMLButtonElement | null) => void;
}) {
  const { pending } = state;
  const busy = pending !== null && pending.verb === verb && sameTarget(pending.target, target);
  return (
    <Button
      {...(buttonRef === undefined ? {} : { ref: buttonRef })}
      size="sm"
      variant={verb === "accept" ? "primary" : "secondary"}
      busy={busy}
      onClick={() => state.decide(verb, target)}
    >
      {label}
    </Button>
  );
}

/** A decision that didn't go through (Q11): what and why, with **Try again**; the change stays undecided. */
function FailedLine({
  state,
  target,
}: {
  readonly state: ProposalDecisionState;
  readonly target: DecisionTarget;
}) {
  const { failure } = state;
  if (failure === null || !sameTarget(failure.target, target)) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 text-small text-danger">
      <span>
        {decisionFailedLine(failure.verb, target === "all")} {failure.reason}
      </span>
      <Button variant="ghost" size="sm" onClick={() => state.decide(failure.verb, failure.target)}>
        Try again
      </Button>
    </div>
  );
}

function sameTarget(a: DecisionTarget, b: DecisionTarget): boolean {
  if (a === "all" || b === "all") return a === b;
  return a.file === b.file;
}
