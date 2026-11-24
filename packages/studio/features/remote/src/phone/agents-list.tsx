import { Button, LetterTile, StatusChip, type StatusChipTone } from "@halonicjs/studio-kit";
import { useId, useRef, useState } from "react";
import { agentRowLine, agentStateWords, oldestApprovalOf } from "./agent-line.ts";
import { type HostText, hostSpoken, hostTitle, hostTitleParts } from "./host-text.ts";
import { HostTextView } from "./host-text-view.tsx";
import { spoken } from "./phone-forms.ts";
import type {
  RemoteApproval,
  RemoteSendOutcome,
  RemoteSession,
  RemoteView,
} from "./remote-view.ts";
import { sendOutcomeLine } from "./send-words.ts";
import { ANSWER_RISKY_ON_COMPUTER } from "./view-of.ts";

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
  deny: "Reject",
};

/** Said politely on the list once the computer took an answer and its buttons went (C48, AP2). */
const answeredWords: Record<(typeof decisions)[number], (agent: string) => string> = {
  approve: (agent) => `Approved: ${agent}.`,
  deny: (agent) => `Rejected: ${agent}.`,
};

/**
 * `s-m2`, `s-m3`: the agents of one computer, each with its name, a line and its state, in the
 * order the host listed them. Tapping a row opens that agent's run detail. An agent that needs you
 * shows its oldest open approval: one the phone never answers says "Answer this on your computer."
 * with no buttons, as the run detail does (HAL-16169); any other shows Approve and Reject. While
 * the view is stale, each line ends with "as of 14:02" and both buttons are off with "You can
 * answer once your phone reconnects." under them. The page round it draws the header, the stale
 * banner and the prompt box. Once the computer takes an answer, focus goes to that agent's row
 * and a polite line on the list says what was answered.
 */
export function AgentsList({
  view,
  onOpen,
  onAnswer,
  now = () => new Date(),
}: {
  readonly view: RemoteView;
  /** A row was tapped: open that agent's run detail. */
  readonly onOpen: (sessionId: string) => void;
  /** `PhoneRemote.answer`. Called only while the approval can be answered. */
  readonly onAnswer: OnAnswer;
  readonly now?: () => Date;
}) {
  const list = useRef<HTMLUListElement>(null);
  const [answered, setAnswered] = useState("");
  const onAnswered = (sessionId: string, agent: string, decision: "approve" | "deny") => {
    setAnswered(answeredWords[decision](agent));
    // Approve and Reject go once the approval settles: the row's own button keeps the focus.
    rowButtonOf(list.current, sessionId)?.focus();
  };
  const today = now();
  return (
    <>
      {view.sessions.length === 0 ? null : (
        <ul
          ref={list}
          className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0"
        >
          {view.sessions.map((session) => {
            const approval =
              session.state === "waiting" ? oldestApprovalOf(view, session.id) : undefined;
            return (
              <AgentRow
                key={session.id}
                session={session}
                line={agentRowLine(view, session, approval, today)}
                approval={approval}
                onOpen={() => onOpen(session.id)}
                onAnswer={onAnswer}
                onAnswered={(agent, decision) => onAnswered(session.id, agent, decision)}
              />
            );
          })}
        </ul>
      )}
      <p role="status" className="sr-only">
        {answered}
      </p>
    </>
  );
}

/** The button that opens `sessionId`'s run detail, in the list `within`. */
export function rowButtonOf(
  within: ParentNode | null | undefined,
  sessionId: string,
): HTMLButtonElement | undefined {
  const rows = within?.querySelectorAll<HTMLButtonElement>("button[data-session]") ?? [];
  return [...rows].find((each) => each.dataset["session"] === sessionId);
}

/**
 * One agent: a button with the letter tile, its name and line, and its state, which opens its run
 * detail; under it, what to do about its approval when it asks.
 */
function AgentRow({
  session,
  line,
  approval,
  onOpen,
  onAnswer,
  onAnswered,
}: {
  readonly session: RemoteSession;
  readonly line: HostText | undefined;
  readonly approval: RemoteApproval | undefined;
  readonly onOpen: () => void;
  readonly onAnswer: OnAnswer;
  /** The computer took an answer to this agent's approval. */
  readonly onAnswered: (agent: string, decision: "approve" | "deny") => void;
}) {
  const state = agentStateWords[session.state];
  const title = hostTitleParts(session.title);
  const agent = spoken(hostSpoken(title));
  const spokenLine = line === undefined ? undefined : hostSpoken(line);
  const name = [hostSpoken(title), spokenLine, state].filter(Boolean).join(", ");
  return (
    <li className="flex flex-col">
      <button
        type="button"
        data-session={session.id}
        className="flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-muted focus-ring-inset"
        onClick={onOpen}
      >
        <LetterTile name={hostTitle(session.title)} size="md" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {/* One line for a screen reader: the visible parts below are read as this. */}
          <span className="sr-only">{spoken(name)}</span>
          <span aria-hidden="true" className="truncate text-body text-fg">
            <HostTextView text={title} />
          </span>
          {line === undefined ? null : (
            <span aria-hidden="true" className="line-clamp-2 text-small text-fg-muted">
              <HostTextView text={line} />
            </span>
          )}
        </span>
        <span aria-hidden="true" className="shrink-0">
          <StatusChip tone={stateTone[session.state]} dot>
            {state}
          </StatusChip>
        </span>
      </button>
      {approval === undefined ? null : (
        // Lined up under the name: the 40px tile and the 12px gap.
        <div className="pr-4 pb-3 pl-17">
          {approval.answerOnComputer ? (
            <p className="text-small text-fg-muted">{ANSWER_RISKY_ON_COMPUTER}</p>
          ) : (
            <ApprovalButtons
              approval={approval}
              agent={agent}
              onAnswer={(decision) => onAnswer(approval.sessionId, approval.approval.id, decision)}
              onAnswered={(decision) => onAnswered(agent, decision)}
            />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Approve and Reject for one approval. Off with the view's reason written under them; off and busy
 * on the one the phone sent while the host hasn't confirmed it, which it never sends again, and
 * the other one gone meanwhile. Once the host answers, a refusal or a cut-off connection is
 * written under them; nothing is sent again by itself.
 */
function ApprovalButtons({
  approval,
  agent,
  onAnswer,
  onAnswered,
}: {
  readonly approval: RemoteApproval;
  /** The agent's name, read after Approve and Reject: "Approve Sorter" (C48, AP1). */
  readonly agent: string;
  readonly onAnswer: (decision: "approve" | "deny") => Promise<RemoteSendOutcome> | undefined;
  readonly onAnswered: (decision: "approve" | "deny") => void;
}) {
  const reasonId = useId();
  const [outcomeLine, setOutcomeLine] = useState<string | undefined>(undefined);
  const { canAnswer, offReason, sent } = approval;
  const unavailable = offReason === undefined ? undefined : { reason: reasonId };
  return (
    <div className="flex flex-col gap-1">
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
                void onAnswer(decision)
                  // A port that rejects never said what became of the answer: a cut-off one.
                  ?.catch((): RemoteSendOutcome => ({ kind: "cut-off" }))
                  .then((outcome) => {
                    if (outcome.kind === "done") onAnswered(decision);
                    setOutcomeLine(sendOutcomeLine("answer", outcome));
                  });
              }}
            >
              {decisionWords[decision]}
              <span className="sr-only"> {agent}</span>
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
