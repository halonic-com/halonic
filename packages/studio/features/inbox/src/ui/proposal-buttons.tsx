// A proposal page's decision buttons (HAL-11945 Q3, Q5, Q6, Q11 and Q12): **Reject all** and
// **Accept all**, a change's **Reject** and **Accept**, and the line with **Try again** when a
// decision didn't go through. Kept apart from `ProposalCard`, which lays them out.

import { Button, type ButtonUnavailable, type ButtonVariant } from "@halonicjs/studio-kit";
import { decisionFailedLine } from "../plain/proposal-text.ts";
import type { ProposalFile } from "../proposal-items.ts";
import type {
  DecisionTarget,
  ProposalDecisionState,
  ProposalVerb,
} from "./use-proposal-decisions.ts";

/**
 * The page's decisions, and while the engine isn't answering, what each button that reaches the
 * host gets instead of acting: the reason it points at.
 */
export type CardState = ProposalDecisionState & { readonly offline: ButtonUnavailable | undefined };

/**
 * The files still to decide here: the undecided ones. A file changed since the run is one of them:
 * until Compare ships only a Reject decides it, and the proposal stays in Needs you until it does
 * (C665 26).
 */
export function openFiles(state: ProposalDecisionState): readonly ProposalFile[] {
  return state.files.filter((file) => file.decision === "undecided");
}

/** Whether **Accept** can still decide one of the open files: not every one changed since the run. */
export function canAccept(state: ProposalDecisionState): boolean {
  return openFiles(state).some((file) => !state.changedSinceRun.has(file.path));
}

/**
 * **Reject all** and **Accept all** (Q3): one undo step each, for what is still undecided. Accept
 * all is the page's one primary button; a change's own buttons are plain words (C667 #1). Once
 * every open file changed since the run, only **Reject all** is left.
 */
export function AllButtons({ state }: { readonly state: CardState }) {
  return (
    <div className="ml-auto flex flex-wrap gap-2">
      <RejectAll state={state} />
      {canAccept(state) ? <AcceptAll state={state} /> : null}
    </div>
  );
}

/**
 * A phone's bar at the foot of the page (Q12): **Accept all** across the whole width, **Reject
 * all** under it, both 48 px high. It stays in sight under the scrolling changes, as a request's
 * bar of answers does.
 */
export function PhoneAllBar({ state }: { readonly state: CardState }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border p-4">
      {canAccept(state) ? <AcceptAll state={state} block /> : null}
      <RejectAll state={state} block />
    </div>
  );
}

function AcceptAll({
  state,
  block = false,
}: {
  readonly state: CardState;
  readonly block?: boolean;
}) {
  return (
    <DecideButton
      state={state}
      verb="accept"
      target="all"
      label="Accept all"
      busyLabel="Accepting all…"
      variant="primary"
      block={block}
    />
  );
}

function RejectAll({
  state,
  block = false,
}: {
  readonly state: CardState;
  readonly block?: boolean;
}) {
  return (
    <DecideButton
      state={state}
      verb="reject"
      target="all"
      label="Reject all"
      busyLabel="Rejecting all…"
      variant="secondary"
      block={block}
    />
  );
}

/**
 * A decision's button (Q6): busy while it is sent, keeping focus; while another is sent it is
 * unavailable (`aria-disabled`, so it stays focusable) and points at the busy one, as a Dialog's
 * Cancel points at its busy confirming button (C667 #4). Like that button, the busy one says what
 * is under way ("Accepting…"), so the reason the others point at isn't just "Accept" (C678 #1); the
 * kit keeps its width.
 */
export function DecideButton({
  state,
  verb,
  target,
  label,
  busyLabel,
  variant,
  buttonRef,
  block = false,
}: {
  readonly state: CardState;
  readonly verb: ProposalVerb;
  readonly target: DecisionTarget;
  readonly label: string;
  readonly busyLabel: string;
  readonly variant: ButtonVariant;
  readonly buttonRef?: (button: HTMLButtonElement | null) => void;
  /** Across the whole width at touch size, for a phone's bar (Q12). */
  readonly block?: boolean;
}) {
  const { pending, busyId, offline } = state;
  const busy = pending !== null && pending.verb === verb && sameTarget(pending.target, target);
  const waiting = pending !== null && !busy;
  return (
    <Button
      {...(buttonRef === undefined ? {} : { ref: buttonRef })}
      {...(busy ? { id: busyId } : {})}
      size={block ? "touch" : "sm"}
      block={block}
      variant={variant}
      busy={busy}
      busyLabel={busyLabel}
      unavailable={waiting ? { reason: busyId } : offline}
      onClick={() => state.decide(verb, target)}
    >
      {label}
    </Button>
  );
}

/** A decision that didn't go through (Q11): what and why, with **Try again**; the change stays undecided. */
export function FailedLine({
  state,
  target,
}: {
  readonly state: CardState;
  readonly target: DecisionTarget;
}) {
  const { failure } = state;
  if (failure === null || !sameTarget(failure.target, target)) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 text-small text-danger">
      <span>
        {decisionFailedLine(failure.verb, target === "all")} {failure.reason}
      </span>
      <Button
        variant="ghost"
        size="sm"
        unavailable={state.offline}
        onClick={() => state.decide(failure.verb, failure.target)}
      >
        Try again
      </Button>
    </div>
  );
}

/** Whether two decisions are for the same change, or both for every change. */
function sameTarget(a: DecisionTarget, b: DecisionTarget): boolean {
  if (a === "all" || b === "all") return a === b;
  return a.file === b.file;
}
