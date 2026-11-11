import { Button, type CalloutHandle, StatusChip } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { InboxDecisions } from "../decide.ts";
import type { ApprovalItem } from "../inbox-items.ts";
import { actionSummary, approvalTitle } from "../plain/approval-text.ts";
import { markedName } from "../plain/hidden-characters.ts";
import { decidedAt, waitingSince } from "../plain/waiting-time.ts";
import { ArgumentList } from "./argument-list.tsx";
import { AskForChangesDialog } from "./ask-for-changes-dialog.tsx";
import {
  type BackLink,
  CardHeader,
  DecidedBar,
  FailedLine,
  failedText,
  type NextItem,
  useEveryMinute,
} from "./card-parts.tsx";
import { useDecisionGuard } from "./decision-guard.ts";

export interface ApprovalCardProps {
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
  /** The next item, or `null` when nothing else is waiting. */
  readonly next: NextItem | null;
  /** Where you came from, for **Back to run** or **Back to the chat**; `null` from the Inbox itself. */
  readonly back: BackLink | null;
  /** The clock, so a test can set it. */
  readonly now?: () => Date;
}

type Decision = "approve" | "reject";
/** What was decided: Approve, Reject, or a note sent with Ask for changes. */
export type Decided =
  | { readonly kind: Decision }
  | { readonly kind: "note"; readonly note: string };
type CardState =
  | { readonly kind: "open"; readonly failed: Decision | null }
  | { readonly kind: "deciding"; readonly decision: Decision }
  | { readonly kind: "decided"; readonly decided: Decided; readonly at: Date };

/** The note form while it's open: the card keeps the note until the item is decided. */
interface NoteForm {
  readonly open: boolean;
  readonly busy: boolean;
  readonly failed: boolean;
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
  const [state, setState] = useState<CardState>({ kind: "open", failed: null });
  const [note, setNote] = useState("");
  const [form, setForm] = useState<NoteForm>({ open: false, busy: false, failed: false });
  const [usableAt] = useState(() => now().getTime());
  const guard = useDecisionGuard(usableAt, () => now().getTime());
  useEveryMinute();

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
    } catch {
      setState({ kind: "open", failed: decision });
    }
  }

  async function sendNote(text: string) {
    if (form.busy || state.kind !== "open") return;
    setForm({ open: true, busy: true, failed: false });
    try {
      await decisions.askForChanges(item, text);
      setForm({ open: false, busy: false, failed: false });
      setState({ kind: "decided", decided: { kind: "note", note: text }, at: now() });
    } catch {
      // The dialog stays open with the note, and says so in its alert slot (flow-inbox 5.4).
      setForm({ open: true, busy: false, failed: true });
    }
  }

  return (
    <section aria-labelledby={titleId} className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <CardHeader
          titleId={titleId}
          title={title}
          heading={heading}
          since={state.kind === "decided" ? null : waitingSince(new Date(item.since), now())}
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
          onDecide={decide}
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
          error={form.failed ? failedText : undefined}
          onSend={sendNote}
          onCancel={() => setForm({ open: false, busy: false, failed: false })}
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
        {markedName(item.rawTool)}
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
  readonly onDecide: (decision: Decision) => void;
  readonly onAskForChanges: () => void;
}

/**
 * The bar under the card, outside its scroll area (INBOX-CARD-18): Reject, Ask for changes and
 * Approve, right-aligned. While one is sent it is busy and the others ignore presses but keep
 * focus. A failed decision says so in the always-mounted alert slot above the buttons.
 */
function DecisionBar({ state, guard, onDecide, onAskForChanges }: DecisionBarProps) {
  const busy = (decision: Decision) => state.kind === "deciding" && state.decision === decision;
  const failed = state.kind === "open" ? state.failed : null;
  return (
    <div
      className="flex flex-col gap-2 border-t border-border p-4"
      onPointerDownCapture={guard.onPointerDownCapture}
      onKeyDownCapture={guard.onKeyDownCapture}
    >
      <FailedLine onRetry={failed === null ? null : () => onDecide(failed)} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          busy={busy("reject")}
          busyLabel={busyLabels.reject}
          onClick={() => onDecide("reject")}
        >
          Reject
        </Button>
        <Button onClick={onAskForChanges}>Ask for changes</Button>
        <Button
          variant="primary"
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
