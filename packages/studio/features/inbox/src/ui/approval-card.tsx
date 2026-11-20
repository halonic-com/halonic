import { markHiddenName } from "@halonicjs/std";
import { Button, type CalloutHandle, StatusChip } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import type { InboxDecisions } from "../decide.ts";
import type { ApprovalItem } from "../inbox-items.ts";
import { actionSummary, approvalTitle } from "../plain/approval-text.ts";
import { decidedAt, waitingSince } from "../plain/waiting-time.ts";
import { ArgumentList } from "./argument-list.tsx";
import { AskForChangesDialog } from "./ask-for-changes-dialog.tsx";
import {
  type BackLink,
  CardHeader,
  cardBodyClasses,
  cardClasses,
  DecidedBar,
  type EngineState,
  FailedLine,
  failedText,
  failureDetailOf,
  type ManualAnswer,
  manualAnswerOf,
  type NextItem,
  NotAnsweringLine,
  unavailableWhile,
  untrustedText,
  useEveryMinute,
  wasDecidedElsewhere,
  wasRefusedUntrusted,
} from "./card-parts.tsx";
import { useDecisionGuard } from "./decision-guard.ts";
import {
  showsUntrusted,
  type TrustReview,
  useClearedWhenTrusted,
  withoutUntrusted,
} from "./workspace-trust.ts";

export interface ApprovalCardProps extends EngineState {
  readonly item: ApprovalItem;
  /** The agent's name as the workspace shows it. */
  readonly agentName: string;
  /**
   * The subagent's name as the workspace shows it, or `null` when the agent asked itself. Resolve
   * it like `agentName`, so the row and the card read the same.
   */
  readonly subagentName: string | null;
  readonly decisions: Pick<InboxDecisions, "approve" | "reject" | "askForChanges">;
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
  /** A note set aside earlier, such as one held for a secret: the card opens with it kept. */
  readonly initialNote?: string | undefined;
  /** **Go to the secret field** in the note dialog: given the note to keep; without it the button isn't offered. */
  readonly onGoToSecret?: ((note: string) => void) | undefined;
  /** Where that button goes; with no account waiting it is the Library's New connector. */
  readonly secretPlace?: "setup" | "connectors" | undefined;
  /**
   * The workspace's trust, for a decision refused because the workspace isn't trusted: **Review**,
   * and when it becomes trusted the line goes and Approve takes focus. Without it there's no **Review**.
   */
  readonly trust?: TrustReview | undefined;
}

type Decision = "approve" | "reject";
/** What was decided: Approve, Reject, or a note sent with Ask for changes. */
export type Decided =
  | { readonly kind: Decision }
  | { readonly kind: "note"; readonly note: string };
type CardState =
  | {
      readonly kind: "open";
      readonly failed: Decision | null;
      /** The decision was refused because the tool call isn't the one waiting any more. */
      readonly elsewhere: boolean;
      readonly manual: ManualAnswer | null;
      /** The failure's own sentence, shown after "Couldn't record your decision.". */
      readonly detail: string | null;
      /** The decision was refused because the workspace isn't trusted. */
      readonly untrusted: boolean;
    }
  | { readonly kind: "deciding"; readonly decision: Decision }
  | { readonly kind: "decided"; readonly decided: Decided; readonly at: Date };

/** The note form while it's open: the card keeps the note until the item is decided. */
interface NoteForm {
  readonly open: boolean;
  readonly busy: boolean;
  readonly failed: boolean;
  /** Set when the note can only go by the command line, which sends `reject` without it. */
  readonly manual: ManualAnswer | null;
  /** The note was refused because the workspace isn't trusted. */
  readonly untrusted: boolean;
}

/** What the command line does with a note: `runs send` takes no note, so only the reject goes. */
const rejectOnlyText = "The command sends Reject without your note.";

/** The note dialog's alert text: the command-line sentence, the plain failure, or nothing. */
function noteError(form: NoteForm): string | undefined {
  if (form.manual !== null) return `${form.manual.message} ${rejectOnlyText}`;
  if (form.untrusted) return untrustedText;
  return form.failed ? failedText : undefined;
}

const busyLabels: Record<Decision, string> = { approve: "Approving…", reject: "Rejecting…" };

/**
 * The decided Callout's text (mc 10.2, ux-checklists-approvals D3); a note follows it as plain
 * text, folded when long, so a pasted page can't fill the bar. `at` is
 * Studio's clock when the answer was recorded: the summary `send` returns
 * has no time for a decision, and the local engine records with the same clock.
 */
export function decidedText(decided: Decided, at: Date): string {
  const time = decidedAt(at);
  switch (decided.kind) {
    case "approve":
      return `Approved by you at ${time}. The run continues.`;
    case "reject":
      return `Rejected by you at ${time}. This tool call didn't run. The agent is told, and the run continues.`;
    case "note":
      return `Note sent to the agent at ${time}:`;
  }
}

/**
 * The card for a tool call waiting for your OK (`inbox.approval-card`): the header, the action
 * with every argument, and the decision bar under it. Opening it focuses its title, never
 * Approve; no key decides. After a decision the card is replaced in place by the decided state,
 * which reports your decision, never the tool's result.
 */
export function ApprovalCard(props: ApprovalCardProps) {
  const { item, agentName, subagentName, decisions, next, back } = props;
  const now = props.now ?? (() => new Date());
  const titleId = useId();
  const title = approvalTitle(item, agentName, subagentName);
  const heading = useRef<HTMLHeadingElement>(null);
  const decided = useRef<CalloutHandle>(null);
  const [state, setState] = useState<CardState>({
    kind: "open",
    failed: null,
    elsewhere: false,
    manual: null,
    detail: null,
    untrusted: false,
  });
  const [note, setNote] = useState(props.initialNote ?? "");
  const [form, setForm] = useState<NoteForm>({
    open: false,
    busy: false,
    failed: false,
    manual: null,
    untrusted: false,
  });
  const [usableAt] = useState(() => now().getTime());
  const guard = useDecisionGuard(usableAt, () => now().getTime());
  const approve = useRef<HTMLButtonElement>(null);
  useEveryMinute();
  useClearedWhenTrusted(
    props.trust,
    showsUntrusted(state),
    () => setState(withoutUntrusted),
    () => approve.current,
  );

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (state.kind === "decided") decided.current?.focus();
  }, [state.kind]);

  async function decide(decision: Decision) {
    if (!guard.allows() || state.kind !== "open") return;
    setState({ kind: "deciding", decision });
    try {
      await (decision === "approve" ? decisions.approve(item) : decisions.reject(item));
      setState({ kind: "decided", decided: { kind: decision }, at: now() });
    } catch (error) {
      setState({
        kind: "open",
        failed: decision,
        elsewhere: wasDecidedElsewhere(error),
        manual: manualAnswerOf(error),
        detail: failureDetailOf(error),
        untrusted: wasRefusedUntrusted(error),
      });
    }
  }

  async function sendNote(text: string) {
    if (form.busy || state.kind !== "open") return;
    setForm({ open: true, busy: true, failed: false, manual: null, untrusted: false });
    try {
      await decisions.askForChanges(item, text);
      setForm({ open: false, busy: false, failed: false, manual: null, untrusted: false });
      setState({ kind: "decided", decided: { kind: "note", note: text }, at: now() });
    } catch (error) {
      // The dialog stays open with the note, and says so in its alert slot (flow-inbox 5.4).
      setForm({
        open: true,
        busy: false,
        failed: true,
        manual: manualAnswerOf(error),
        untrusted: wasRefusedUntrusted(error),
      });
    }
  }

  return (
    <section aria-labelledby={titleId} className={cardClasses}>
      <div className={cardBodyClasses}>
        <CardHeader
          titleId={titleId}
          title={title}
          heading={heading}
          since={state.kind === "decided" ? null : waitingSince(new Date(item.since), now())}
          startedBy={props.startedBy}
          onOpenRun={
            props.onOpenRun === undefined ? undefined : () => props.onOpenRun?.(item.runId)
          }
        />
        {state.kind === "decided" ? <DecidedAction item={item} /> : <Action item={item} />}
      </div>
      {state.kind === "decided" ? (
        <DecidedBar
          text={decidedText(state.decided, state.at)}
          {...(state.decided.kind === "note" ? { note: state.decided.note } : {})}
          next={next}
          back={back}
          callout={decided}
        />
      ) : (
        <DecisionBar
          state={state}
          guard={guard}
          engine={props}
          onDecide={decide}
          onReviewTrust={props.trust?.review}
          approve={approve}
          onOpenRun={
            props.onOpenRun === undefined ? undefined : () => props.onOpenRun?.(item.runId)
          }
          onAskForChanges={() => {
            if (guard.allows() && state.kind === "open") setForm({ ...form, open: true });
          }}
        />
      )}
      {form.open ? (
        <AskForChangesDialog
          note={note}
          onNoteChange={setNote}
          busy={form.busy}
          error={noteError(form)}
          command={form.manual?.command}
          onSend={sendNote}
          {...(props.onGoToSecret === undefined ? {} : { onGoToSecret: props.onGoToSecret })}
          {...(props.secretPlace === undefined ? {} : { secretPlace: props.secretPlace })}
          onCancel={() =>
            setForm({ open: false, busy: false, failed: false, manual: null, untrusted: false })
          }
        />
      ) : null}
    </section>
  );
}

/** The action: what runs if you approve, with every argument (INBOX-CARD-01, 05). */
function Action({ item }: { readonly item: ApprovalItem }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-section text-fg wrap-anywhere">{actionSummary(item)}</h3>
        {item.connector === null ? null : (
          <StatusChip tone="outline">External connector (MCP)</StatusChip>
        )}
      </div>
      <code className="font-mono text-code text-fg-muted wrap-anywhere">
        {markHiddenName(item.rawTool)}
      </code>
      <ArgumentList args={item.args} tool={item.tool} />
    </div>
  );
}

/** The action once decided: its summary, muted, in a dashed frame, so it no longer reads as open. */
function DecidedAction({ item }: { readonly item: ApprovalItem }) {
  return (
    <p className="rounded-sm border border-dashed border-border p-3 text-body text-fg-muted wrap-anywhere">
      {actionSummary(item)}
    </p>
  );
}

interface DecisionBarProps {
  readonly state: Exclude<CardState, { kind: "decided" }>;
  readonly guard: ReturnType<typeof useDecisionGuard>;
  readonly engine: EngineState;
  readonly onDecide: (decision: Decision) => void;
  readonly onAskForChanges: () => void;
  readonly onOpenRun: (() => void) | undefined;
  readonly onReviewTrust: ((opener: HTMLElement | null) => void) | undefined;
  readonly approve: RefObject<HTMLButtonElement | null>;
}

/**
 * The bar under the card, outside its scroll area (INBOX-CARD-18): Reject, Ask for changes and
 * Approve, right-aligned. While one is sent it is busy and the others ignore presses but keep
 * focus. A failed decision says so in the always-mounted alert slot above the buttons.
 */
function DecisionBar({
  state,
  guard,
  engine,
  onDecide,
  onAskForChanges,
  onOpenRun,
  onReviewTrust,
  approve,
}: DecisionBarProps) {
  const reasonId = useId();
  const unavailable = unavailableWhile(engine.answering ?? true, reasonId);
  const busy = (decision: Decision) => state.kind === "deciding" && state.decision === decision;
  const failed = state.kind === "open" ? state.failed : null;
  return (
    <div
      className="flex flex-col gap-2 border-t border-border p-4"
      onPointerDownCapture={guard.onPointerDownCapture}
      onKeyDownCapture={guard.onKeyDownCapture}
    >
      <NotAnsweringLine id={reasonId} {...engine} />
      <FailedLine
        onRetry={failed === null ? null : () => onDecide(failed)}
        detail={state.kind === "open" ? state.detail : null}
        manual={state.kind === "open" ? state.manual : null}
        elsewhere={state.kind === "open" && state.elsewhere ? { openRun: onOpenRun } : null}
        untrusted={state.kind === "open" && state.untrusted ? { review: onReviewTrust } : null}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          unavailable={unavailable}
          busy={busy("reject")}
          busyLabel={busyLabels.reject}
          onClick={() => onDecide("reject")}
        >
          Reject
        </Button>
        <Button unavailable={unavailable} onClick={onAskForChanges}>
          Ask for changes
        </Button>
        <Button
          ref={approve}
          variant="primary"
          unavailable={unavailable}
          busy={busy("approve")}
          busyLabel={busyLabels.approve}
          onClick={() => onDecide("approve")}
        >
          Approve
        </Button>
      </div>
    </div>
  );
}
