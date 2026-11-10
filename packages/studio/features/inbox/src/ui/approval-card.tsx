import { Button, Callout, type CalloutHandle, StatusChip } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import type { InboxDecisions } from "../decide.ts";
import type { ApprovalItem } from "../inbox-items.ts";
import { actionSummary, approvalTitle } from "../plain/approval-text.ts";
import { markedName } from "../plain/hidden-characters.ts";
import { decidedAt, waitingSince } from "../plain/waiting-time.ts";
import { ArgumentList } from "./argument-list.tsx";
import { useDecisionGuard } from "./decision-guard.ts";

/** The item after this one, for the decided card's **Next** (flow-inbox 5.3). */
export interface NextItem {
  readonly title: string;
  /** Items still waiting, this one not counted. */
  readonly left: number;
  readonly open: () => void;
}

export interface ApprovalCardProps {
  readonly item: ApprovalItem;
  /** The agent's name as the workspace shows it. */
  readonly agentName: string;
  readonly decisions: Pick<InboxDecisions, "approve" | "reject">;
  readonly onOpenRun: (runId: string) => void;
  /** Opens the note form; the card doesn't hold the note. */
  readonly onAskForChanges: () => void;
  /** The next item, or `null` when nothing else is waiting. */
  readonly next: NextItem | null;
  /** The clock, so a test can set it. */
  readonly now?: () => Date;
}

type Decision = "approve" | "reject";
type CardState =
  | { readonly kind: "open"; readonly failed: Decision | null }
  | { readonly kind: "deciding"; readonly decision: Decision }
  | { readonly kind: "decided"; readonly decision: Decision; readonly at: Date };

const busyLabels: Record<Decision, string> = { approve: "Approving…", reject: "Rejecting…" };

/** The decided Callout's text (mc 10.2, ux-checklists-approvals D3). */
export function decidedText(decision: Decision, at: Date): string {
  const time = decidedAt(at);
  return decision === "approve"
    ? `Approved by you at ${time}. The run continues.`
    : `Rejected by you at ${time}. This tool call didn't run. The agent is told, and the run continues.`;
}

/**
 * The card for a tool call waiting for your OK (`inbox.approval-card`): the header, the action
 * with every argument, and the decision bar under it. Opening it focuses its title, never
 * Approve; no key decides. After a decision the card is replaced in place by the decided state,
 * which reports your decision, never the tool's result.
 */
export function ApprovalCard(props: ApprovalCardProps) {
  const { item, agentName, decisions, next } = props;
  const now = props.now ?? (() => new Date());
  const titleId = useId();
  const title = approvalTitle(item, agentName);
  const heading = useRef<HTMLHeadingElement>(null);
  const decided = useRef<CalloutHandle>(null);
  const [state, setState] = useState<CardState>({ kind: "open", failed: null });
  const [usableAt] = useState(() => now().getTime());
  const guard = useDecisionGuard(usableAt, () => now().getTime());

  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (state.kind === "decided") decided.current?.focus();
  }, [state.kind]);

  async function decide(decision: Decision) {
    if (!guard.allows() || state.kind !== "open") return;
    setState({ kind: "deciding", decision });
    try {
      await (decision === "approve" ? decisions.approve(item) : decisions.reject(item));
      setState({ kind: "decided", decision, at: now() });
    } catch {
      setState({ kind: "open", failed: decision });
    }
  }

  return (
    <section aria-labelledby={titleId} className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              ref={heading}
              tabIndex={-1}
              className="focus-ring text-title text-fg wrap-break-word"
            >
              {title}
            </h2>
            <p className="text-small text-fg-muted">{waitingSince(new Date(item.since), now())}</p>
          </div>
          <Button size="sm" onClick={() => props.onOpenRun(item.runId)}>
            Open run
          </Button>
        </header>
        {state.kind === "decided" ? <DecidedAction item={item} /> : <Action item={item} />}
      </div>
      {state.kind === "decided" ? (
        <DecidedBar text={decidedText(state.decision, state.at)} next={next} callout={decided} />
      ) : (
        <DecisionBar
          state={state}
          guard={guard}
          onDecide={decide}
          onAskForChanges={() => {
            if (guard.allows() && state.kind === "open") props.onAskForChanges();
          }}
        />
      )}
    </section>
  );
}

interface DecidedBarProps {
  readonly text: string;
  readonly next: NextItem | null;
  readonly callout: RefObject<CalloutHandle | null>;
}

/** The bar once decided: the decided Callout, which takes focus, then **Next** (flow-inbox 5.3). */
function DecidedBar({ text, next, callout }: DecidedBarProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-border p-4">
      <Callout tone="info" announce="focus" ref={callout}>
        {text}
      </Callout>
      <div className="flex justify-end">
        {next === null ? (
          <p className="text-small text-fg-muted">Nothing else is waiting for you.</p>
        ) : (
          <Button variant="primary" onClick={next.open}>
            {`Next: ${next.title}`}
            <span aria-hidden="true">{` · ${next.left} left`}</span>
            <span className="sr-only">{`, ${next.left} left`}</span>
          </Button>
        )}
      </div>
    </div>
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
      <div role="alert" className="text-small text-fg">
        {failed === null ? null : (
          <span className="flex flex-wrap items-center gap-2">
            Couldn't record your decision.
            <Button variant="ghost" size="sm" onClick={() => onDecide(failed)}>
              Try again
            </Button>
          </span>
        )}
      </div>
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
