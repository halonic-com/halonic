// A proposal page's decision buttons (HAL-11945 Q3, Q5, Q6, Q11 and Q12): **Reject all** and
// **Accept all**, a change's **Reject** and **Accept**, and the line with **Try again** when a
// decision didn't go through. Kept apart from `ProposalCard`, which lays them out.

import { Button, type ButtonUnavailable, type ButtonVariant } from "@halonicjs/studio-kit";
import { copyDetailsWords, detailsOf, useCopyDetails } from "@halonicjs/studio-shell";
import { decisionFailedLine, decisionFailureReason } from "../plain/proposal-text.ts";
import type { ProposalFile } from "../proposal-items.ts";
import { ReviewTrustButton } from "./review-trust-button.tsx";
import type {
  DecisionFailure,
  DecisionTarget,
  ProposalDecisionState,
  ProposalVerb,
} from "./use-proposal-decisions.ts";

/**
 * The page's decisions, and while the engine isn't answering, what each button that reaches the
 * host gets instead of acting: the reason it points at. `review` opens the workspace's trust check,
 * for a decision refused because it isn't trusted; without it that line has no **Review**.
 */
export type CardState = ProposalDecisionState & {
  readonly offline: ButtonUnavailable | undefined;
  readonly review: ((opener: HTMLElement | null) => void) | undefined;
};

/**
 * The files still to decide here: the undecided ones. A file changed since the run is one of them,
 * decided by its **Reject** or in Compare (C665 26, Q9).
 */
export function openFiles(state: ProposalDecisionState): readonly ProposalFile[] {
  return state.files.filter((file) => file.decision === "undecided");
}

/**
 * **Reject all** and **Accept all** (Q3): one undo step each, for what is still undecided. Accept
 * all is the page's one primary button; a change's own buttons are plain words (C667 #1). An
 * **Accept all** that leaves files alone because they changed since the run opens Compare (Q9).
 */
export function AllButtons({ state }: { readonly state: CardState }) {
  return (
    <div className="ml-auto flex flex-wrap gap-2">
      <RejectAll state={state} />
      <AcceptAll state={state} />
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
      <AcceptAll state={state} block />
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
 * kit keeps its width. `onPress` does something else in its place, such as opening Compare.
 * `what` names the one change it decides, after the words you see, so a screen reader tells a
 * file's **Accept** from the next one's: "Accept docs/returns.md changed" (C46 PR1).
 */
export function DecideButton({
  state,
  verb,
  target,
  label,
  busyLabel,
  variant,
  what,
  buttonRef,
  onPress,
  block = false,
}: {
  readonly state: CardState;
  readonly verb: ProposalVerb;
  readonly target: DecisionTarget;
  readonly label: string;
  readonly busyLabel: string;
  readonly variant: ButtonVariant;
  /** The change it decides, read after the label: "docs/returns.md changed". */
  readonly what?: string;
  readonly buttonRef?: (button: HTMLButtonElement | null) => void;
  readonly onPress?: (() => void) | undefined;
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
      // A file's Reject and Accept end a row that wraps to start one, so neither edge fits both.
      busyAlign="center"
      {...(what === undefined
        ? {}
        : { name: `${label} ${what}`, busyName: `${busyLabel} ${what}` })}
      unavailable={waiting ? { reason: busyId } : offline}
      onClick={onPress ?? (() => state.decide(verb, target))}
    >
      {label}
    </Button>
  );
}

/**
 * A decision that didn't go through (Q11, C665 27): what and why, by the failure's kind, never the
 * host's text; the change stays undecided. The engine not answering has **Try again**, a workspace
 * not trusted yet **Review**, as on an approval's card, and a reason Halonic can't explain
 * **Copy details**, the only place the host's own words reach the person.
 */
export function FailedLine({
  state,
  target,
}: {
  readonly state: CardState;
  readonly target: DecisionTarget;
}) {
  const { failure } = state;
  if (failure === null || !sameTarget(failure.target, target)) return null;
  const line = `${decisionFailedLine(failure.verb, target === "all")} ${decisionFailureReason(failure.failure)}`;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 text-small text-danger">
      <span>{line}</span>
      <FailedLineButton state={state} failure={failure} line={line} />
    </div>
  );
}

function FailedLineButton({
  state,
  failure,
  line,
}: {
  readonly state: CardState;
  readonly failure: DecisionFailure;
  readonly line: string;
}) {
  const copyDetails = useCopyDetails();
  switch (failure.failure) {
    case "not-answering":
      return (
        <Button
          variant="ghost"
          size="sm"
          unavailable={state.offline}
          onClick={() => state.decide(failure.verb, failure.target)}
        >
          Try again
        </Button>
      );
    case "untrusted":
      return state.review === undefined ? null : <ReviewTrustButton review={state.review} />;
    default:
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copyDetails(detailsOf(line, failure.error))}
        >
          {copyDetailsWords.label}
        </Button>
      );
  }
}

/** Whether two decisions are for the same change, or both for every change. */
function sameTarget(a: DecisionTarget, b: DecisionTarget): boolean {
  if (a === "all" || b === "all") return a === b;
  return a.file === b.file;
}
