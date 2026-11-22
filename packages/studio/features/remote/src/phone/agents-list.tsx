import { Button, LetterTile, StatusChip, type StatusChipTone } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import { agentRowLine, agentStateWords, oldestApprovalOf } from "./agent-line.ts";
import { spoken } from "./phone-forms.ts";
import type {
  RemoteApproval,
  RemoteSendOutcome,
  RemoteSession,
  RemoteView,
} from "./remote-view.ts";
import { sendOutcomeLine } from "./send-words.ts";

const stateTone: Record<RemoteSession["state"], StatusChipTone> = {
  running: "running",
  waiting: "warning",
  done: "success",
  failed: "danger",
};

const decisions = ["approve", "deny"] as const;

/** `PhoneRemote.answer`; what became of the answer shows under the buttons. */
type OnAnswer = (
  sessionId: string,
  approvalId: string,
  decision: "approve" | "deny",
) => Promise<RemoteSendOutcome> | undefined;

const decisionWords: Record<(typeof decisions)[number], string> = {
  approve: "Approve",
  deny: "Deny",
};

/**
 * `s-m2`, `s-m3`: the agents of one computer, each with its name, a line and its state, in the
 * order the host listed them. An agent that needs you shows Approve and Deny for its oldest open
 * approval. While the view is stale, each line ends with "as of 14:02" and both buttons are off
 * with "You can answer once your phone reconnects." under them; a risky approval says to answer it on the computer. The
 * page round it draws the header, the stale banner and the prompt box.
 */
export function AgentsList({
  view,
  onAnswer,
  now = () => new Date(),
}: {
  readonly view: RemoteView;
  /** `PhoneRemote.answer`. Called only while the approval can be answered. */
  readonly onAnswer: OnAnswer;
  readonly now?: () => Date;
}) {
  if (view.sessions.length === 0) return null;
  const today = now();
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
      {view.sessions.map((session) => {
        const approval =
          session.state === "waiting" ? oldestApprovalOf(view, session.id) : undefined;
        return (
          <AgentRow
            key={session.id}
            session={session}
            line={agentRowLine(view, session, approval, today)}
            approval={approval}
            onAnswer={onAnswer}
          />
        );
      })}
    </ul>
  );
}

/** One agent: the letter tile, its name and line, its state, and Approve and Deny when it asks. */
function AgentRow({
  session,
  line,
  approval,
  onAnswer,
}: {
  readonly session: RemoteSession;
  readonly line: string | undefined;
  readonly approval: RemoteApproval | undefined;
  readonly onAnswer: OnAnswer;
}) {
  const state = agentStateWords[session.state];
  const name = [session.title, line, state].filter(Boolean).join(", ");
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <LetterTile name={session.title} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* One line for a screen reader: the visible parts below are read as this. */}
        <span className="sr-only">{spoken(name)}</span>
        <span aria-hidden="true" className="truncate text-body text-fg">
          {session.title}
        </span>
        {line === undefined ? null : (
          <span aria-hidden="true" className="line-clamp-2 text-small text-fg-muted">
            {line}
          </span>
        )}
        {approval === undefined ? null : (
          <ApprovalButtons
            approval={approval}
            onAnswer={(decision) => onAnswer(approval.sessionId, approval.approval.id, decision)}
          />
        )}
      </div>
      <span aria-hidden="true" className="shrink-0">
        <StatusChip tone={stateTone[session.state]} dot>
          {state}
        </StatusChip>
      </span>
    </li>
  );
}

/**
 * Approve and Deny for one approval. Off with the view's reason written under them; off and busy
 * on the one the phone sent while the host hasn't confirmed it, which it never sends again, and
 * the other one gone meanwhile. Once the host answers, a refusal or a cut-off connection is
 * written under them; nothing is sent again by itself.
 */
function ApprovalButtons({
  approval,
  onAnswer,
}: {
  readonly approval: RemoteApproval;
  readonly onAnswer: (decision: "approve" | "deny") => Promise<RemoteSendOutcome> | undefined;
}) {
  const reasonId = useId();
  const [outcomeLine, setOutcomeLine] = useState<string | undefined>(undefined);
  const { canAnswer, offReason, sent } = approval;
  const unavailable = offReason === undefined ? undefined : { reason: reasonId };
  return (
    <div className="flex flex-col gap-1 pt-1">
      <div className="flex gap-2">
        {decisions
          .filter((decision) => sent === undefined || sent === decision)
          .map((decision) => (
            <Button
              key={decision}
              variant="secondary"
              size="touch"
              unavailable={unavailable}
              busy={sent === decision}
              onClick={() => {
                if (!canAnswer) return;
                setOutcomeLine(undefined);
                void onAnswer(decision)?.then((outcome) =>
                  setOutcomeLine(sendOutcomeLine("answer", outcome)),
                );
              }}
            >
              {decisionWords[decision]}
            </Button>
          ))}
      </div>
      {offReason === undefined ? null : (
        <p id={reasonId} className="text-small text-fg-muted">
          {offReason}
        </p>
      )}
      {/* Refused, not sent or cut off: said once, as it appears. */}
      <p role="status" className="text-small text-fg-muted">
        {outcomeLine}
      </p>
    </div>
  );
}
