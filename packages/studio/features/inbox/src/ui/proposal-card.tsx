import {
  Button,
  type ButtonUnavailable,
  type ButtonVariant,
  breakableAtSeparators,
  CommandBox,
  inlineLinkClasses,
} from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useId, useRef } from "react";
import {
  beforeAcceptLines,
  changedSinceRunLine,
  changeLine,
  changesBackLine,
  decideCommand,
  decidedSummary,
  decideElsewhereLine,
  decisionFailedLine,
  proposalFacts,
  seeRunText,
} from "../plain/proposal-text.ts";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import type { ProposalFile, ProposalItem } from "../proposal-items.ts";
import {
  cardBodyClasses,
  cardClasses,
  type EngineState,
  NotAnsweringLine,
  unavailableWhile,
} from "./card-parts.tsx";
import { itemTitle } from "./inbox-row.tsx";
import { GoneLine } from "./proposal-gone.tsx";
import type { RunFacts } from "./run-facts.ts";
import {
  type DecisionTarget,
  type ProposalDecisionState,
  type ProposalVerb,
  useProposalDecisions,
} from "./use-proposal-decisions.ts";

/** What {@link ProposalCard} shows. */
export interface ProposalCardProps extends EngineState {
  readonly item: ProposalItem;
  readonly now: Date;
  /** The run's workflow and starter, from the Runs list; `undefined` while it doesn't have the run. */
  readonly facts: RunFacts | undefined;
  /** Accept and Reject; without them the page shows the changes and the command that decides them. */
  readonly decisions: ProposalDecisions | undefined;
  /** After each decision or Undo, so the Inbox reads its items again and the count drops. */
  readonly onDecided: () => void;
  /**
   * Reads the proposal again and fails when the read does: after a Remove the host refused because
   * the changes are there again, so the page can show them (C711 4).
   */
  readonly readAgain: () => Promise<void>;
  readonly onOpenRun?: ((runId: string) => void) | undefined;
}

/**
 * A run proposal opened from Needs you (flow-inbox 2.2, HAL-11945 Q3 to Q7): the row's title, the
 * workflow, when the run ended and what started it, with **Reject all** and **Accept all**; then
 * what accepting does, before any Accept, and one line per change with **Reject** and **Accept**.
 * A decided line says so in place of its buttons, and focus moves to the next **Accept**, else to
 * what the proposal came to. Where the window can't decide, the changes end with the terminal
 * command that does (HAL-15986).
 *
 * When the host says the proposal's texts are gone, the page offers only **Remove from Inbox** (Q11).
 * When it then finds them there again, the changes come back under a line that says so (C711 4).
 * While the engine isn't answering, the host's line sits above the header, and every button that
 * would reach the host stays but doesn't act, pointing at that line (Q11), as on a request's card.
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
  readAgain,
  onOpenRun,
  answering = true,
  signedOut = false,
  words,
}: ProposalCardProps) {
  const titleId = useId();
  const reasonId = useId();
  const state: CardState = {
    ...useProposalDecisions(item, decisions, onDecided),
    offline: unavailableWhile(answering, reasonId),
  };
  const open = openFiles(state).length > 0;
  return (
    <section aria-labelledby={titleId} className={cardClasses}>
      <div className={cardBodyClasses}>
        <NotAnsweringLine
          id={reasonId}
          answering={answering}
          signedOut={signedOut}
          {...(words === undefined ? {} : { words })}
        />
        <ProposalHeader
          item={item}
          titleId={titleId}
          facts={proposalFacts(item, now, facts)}
          state={decisions !== undefined && open && !state.gone ? state : null}
        />
        {decisions !== undefined && state.gone ? (
          <GoneLine
            runId={item.runId}
            decisions={decisions}
            onRemoved={onDecided}
            readAgain={readAgain}
            onChangesBack={state.changesBack}
            unavailable={state.offline}
          />
        ) : (
          <ProposalChanges
            item={item}
            state={state}
            buttons={decisions !== undefined}
            onOpenRun={onOpenRun}
          />
        )}
        <p role="status" className="sr-only">
          {state.announcement}
        </p>
      </div>
    </section>
  );
}

/**
 * The page's decisions, and while the engine isn't answering, what each button that reaches the
 * host gets instead of acting: the reason it points at.
 */
type CardState = ProposalDecisionState & { readonly offline: ButtonUnavailable | undefined };

/**
 * What accepting does, the changes, each with **Reject** and **Accept** while `buttons`, and what
 * the proposal came to once nothing is left to decide. Without `buttons`, the command that decides.
 */
function ProposalChanges({
  item,
  state,
  buttons,
  onOpenRun,
}: {
  readonly item: ProposalItem;
  readonly state: CardState;
  readonly buttons: boolean;
  readonly onOpenRun: ((runId: string) => void) | undefined;
}) {
  const open = openFiles(state);
  const { nextButtons, summary } = useFocusAfterDecision(state, open[0]?.path);
  return (
    <>
      {state.back ? <ChangesBackLine runId={item.runId} /> : null}
      <FailedLine state={state} target="all" />
      <BeforeAccept item={item} onOpenRun={onOpenRun} />
      <ul className="flex flex-col gap-2">
        {state.files.map((file) => (
          <ChangeRow
            key={file.path}
            file={file}
            runId={item.runId}
            state={state}
            buttons={buttons}
            nextButtons={nextButtons}
          />
        ))}
      </ul>
      {!buttons && open.length > 0 ? <DecideElsewhere runId={item.runId} /> : null}
      {open.length === 0 && state.decided > 0 ? (
        <p ref={summary} tabIndex={-1} className="focus-ring text-body text-fg">
          {decidedSummary(state.files)}
        </p>
      ) : null}
    </>
  );
}

/**
 * The files still to decide here: the undecided ones. A file changed since the run is one of them:
 * until Compare ships only a Reject decides it, and the proposal stays in Needs you until it does
 * (C665 26).
 */
function openFiles(state: ProposalDecisionState): readonly ProposalFile[] {
  return state.files.filter((file) => file.decision === "undecided");
}

/** Whether **Accept** can still decide one of the open files: not every one changed since the run. */
function canAccept(state: ProposalDecisionState): boolean {
  return openFiles(state).some((file) => !state.changedSinceRun.has(file.path));
}

/**
 * Above the changes once they are there again after the host said they were gone (C711 4). It
 * takes focus, since it replaces **Remove from Inbox**, the button just pressed.
 */
function ChangesBackLine({ runId }: { readonly runId: string }) {
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => line.current?.focus(), []);
  return (
    <p ref={line} tabIndex={-1} className="focus-ring text-body text-fg">
      {changesBackLine(runId)}
    </p>
  );
}

/**
 * Q6: once a decision is back, focus goes to the next undecided file's **Accept**, or its
 * **Reject** when it changed since the run, else to what the proposal came to. A failed one leaves
 * it on its button, by its **Try again**. Only decisions made while the changes show count: when
 * they come back after the gone line, the line that says so keeps focus (C711 4).
 */
function useFocusAfterDecision(state: ProposalDecisionState, nextPath: string | undefined) {
  const nextButtons = useRef(new Map<string, HTMLButtonElement>());
  const summary = useRef<HTMLParagraphElement>(null);
  const { decided, failure } = state;
  const decidedWhenShown = useRef(decided);
  useEffect(() => {
    if (decided === decidedWhenShown.current || failure !== null) return;
    const next = nextPath === undefined ? summary.current : nextButtons.current.get(nextPath);
    next?.focus();
  }, [decided, failure, nextPath]);
  return { nextButtons, summary };
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
  readonly state: CardState | null;
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

/**
 * **Reject all** and **Accept all** (Q3): one undo step each, for what is still undecided. Accept
 * all is the page's one primary button; a change's own buttons are plain words (C667 #1). Once
 * every open file changed since the run, only **Reject all** is left.
 */
function AllButtons({ state }: { readonly state: CardState }) {
  return (
    <div className="ml-auto flex flex-wrap gap-2">
      <DecideButton
        state={state}
        verb="reject"
        target="all"
        label="Reject all"
        busyLabel="Rejecting all…"
        variant="secondary"
      />
      {canAccept(state) ? (
        <DecideButton
          state={state}
          verb="accept"
          target="all"
          label="Accept all"
          busyLabel="Accepting all…"
          variant="primary"
        />
      ) : null}
    </div>
  );
}

/** Where the window can't decide: the line and the command that shows the proposal on your computer. */
function DecideElsewhere({ runId }: { readonly runId: string }) {
  return (
    <div className="flex flex-col gap-2 text-body text-fg-muted">
      <p>{decideElsewhereLine}</p>
      <CommandBox command={decideCommand(runId)} />
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
    <div className="flex flex-col gap-1 text-small text-fg-muted">
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

/**
 * One change (Q5, Q6): its line, then **Reject** and **Accept** as plain words, or what was
 * decided, muted. The line keeps at least 16 rem, so in a narrow pane the buttons wrap under it
 * instead of squeezing a path until it breaks mid-word (C667 #2). A path still too long for the
 * line wraps before a "/" first, as MiddleCut's end does, and inside a name only when one name
 * alone is too long (C678 #2). A file changed since the run keeps only **Reject** (C665 26).
 */
function ChangeRow({
  file,
  runId,
  state,
  buttons,
  nextButtons,
}: {
  readonly file: ProposalFile;
  readonly runId: string;
  readonly state: CardState;
  readonly buttons: boolean;
  /** Each open file's button that takes focus when it is next: its Accept, else its Reject. */
  readonly nextButtons: RefObject<Map<string, HTMLButtonElement>>;
}) {
  const decided = decidedWords[file.decision];
  const changedSinceRun = state.changedSinceRun.has(file.path);
  const target = { file: file.path };
  const nextRef = (button: HTMLButtonElement | null) => {
    if (button === null) nextButtons.current.delete(file.path);
    else nextButtons.current.set(file.path, button);
  };
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 basis-64 text-body wrap-break-word">
          {breakableAtSeparators(changeLine(file))}
        </span>
        {decided === undefined && buttons ? (
          <span className="flex gap-2">
            <DecideButton
              state={state}
              verb="reject"
              target={target}
              label="Reject"
              busyLabel="Rejecting…"
              variant="ghost"
              {...(changedSinceRun ? { buttonRef: nextRef } : {})}
            />
            {changedSinceRun ? null : (
              <DecideButton
                state={state}
                verb="accept"
                target={target}
                label="Accept"
                busyLabel="Accepting…"
                variant="ghost"
                buttonRef={nextRef}
              />
            )}
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
 * A decision's button (Q6): busy while it is sent, keeping focus; while another is sent it is
 * unavailable (`aria-disabled`, so it stays focusable) and points at the busy one, as a Dialog's
 * Cancel points at its busy confirming button (C667 #4). Like that button, the busy one says what
 * is under way ("Accepting…"), so the reason the others point at isn't just "Accept" (C678 #1); the
 * kit keeps its width.
 */
function DecideButton({
  state,
  verb,
  target,
  label,
  busyLabel,
  variant,
  buttonRef,
}: {
  readonly state: CardState;
  readonly verb: ProposalVerb;
  readonly target: DecisionTarget;
  readonly label: string;
  readonly busyLabel: string;
  readonly variant: ButtonVariant;
  readonly buttonRef?: (button: HTMLButtonElement | null) => void;
}) {
  const { pending, busyId, offline } = state;
  const busy = pending !== null && pending.verb === verb && sameTarget(pending.target, target);
  const waiting = pending !== null && !busy;
  return (
    <Button
      {...(buttonRef === undefined ? {} : { ref: buttonRef })}
      {...(busy ? { id: busyId } : {})}
      size="sm"
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
function FailedLine({
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

function sameTarget(a: DecisionTarget, b: DecisionTarget): boolean {
  if (a === "all" || b === "all") return a === b;
  return a.file === b.file;
}
