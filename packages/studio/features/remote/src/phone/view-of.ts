/**
 * Builds the {@link RemoteView} the screens show from what the gateway client
 * holds (tunnel D7, design on HAL-15159, sections 2 and 3).
 */

import type { GatewaySession } from "@halonicjs/ports";
import { type PhoneState, phoneStatusLabel } from "./phone-status.ts";
import {
  RECONNECT_TO_ANSWER,
  type RemoteApproval,
  type RemoteSession,
  type RemoteView,
  UPDATE_TO_ANSWER,
} from "./remote-view.ts";
import type { SentAnswers } from "./sent-answers.ts";
import type { SessionMemory } from "./session-memory.ts";

/**
 * Why Approve and Reject are off for a `risky` approval: the phone answers none
 * until it has biometric unlock (board decision 4b). Interim words: the final
 * ones are a wording call with Elena and Sofia.
 */
export const ANSWER_RISKY_ON_COMPUTER = "Answer this on your computer.";

/** What the client holds of one computer. */
export interface ClientHolding {
  /** The computer's name, for the header label. */
  readonly computer: string;
  readonly state: PhoneState;
  /** A session list arrived since the last `welcome`. */
  readonly listed: boolean;
  readonly asOf: Date | undefined;
  /** The last session list, in the host's order. */
  readonly sessions: readonly GatewaySession[];
  readonly memories: ReadonlyMap<string, SessionMemory>;
  readonly sentAnswers: SentAnswers;
  /** What the last session list said of the risky switch. */
  readonly answersRisky: boolean;
  /** The last connection found the two sides on different message versions. */
  readonly updateNeeded: boolean;
}

/** The view of `holding`: live only while connected and listed since the last `welcome`. */
export function viewOf(holding: ClientHolding): RemoteView {
  const live = holding.state === "connected" && holding.listed;
  const notLiveReason = holding.updateNeeded ? UPDATE_TO_ANSWER : RECONNECT_TO_ANSWER;
  return {
    label: phoneStatusLabel(holding.state, holding.computer),
    asOf: holding.asOf,
    sessions: holding.sessions.map((session) => sessionOf(session, holding.memories)),
    openApprovals: openApprovalsOf(holding, live, notLiveReason),
    canAnswer: live,
    offReason: live ? undefined : notLiveReason,
    answersRisky: holding.answersRisky,
    updateNeeded: holding.updateNeeded,
  };
}

function sessionOf(
  session: GatewaySession,
  memories: ReadonlyMap<string, SessionMemory>,
): RemoteSession {
  const memory = memories.get(session.id);
  return {
    id: session.id,
    title: session.title,
    state: session.state,
    updatedAt: session.updatedAt,
    events: memory?.events ?? [],
    droppedOlder: memory?.droppedOlder ?? false,
  };
}

/** Every open approval of the listed sessions, oldest request first. */
function openApprovalsOf(
  holding: ClientHolding,
  live: boolean,
  notLiveReason: string,
): RemoteApproval[] {
  const approvals = holding.sessions.flatMap((session) =>
    (holding.memories.get(session.id)?.openApprovals ?? []).map(
      ({ approval, requestedAt }): RemoteApproval => {
        const sent = holding.sentAnswers.decisionFor(approval.id);
        const offReason = live ? riskOffReason(approval.risk) : notLiveReason;
        return {
          sessionId: session.id,
          approval,
          requestedAt,
          canAnswer: offReason === undefined && sent === undefined,
          offReason,
          answerOnComputer: approval.risk === "risky",
          sent,
        };
      },
    ),
  );
  return approvals.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

function riskOffReason(risk: "normal" | "risky"): string | undefined {
  return risk === "risky" ? ANSWER_RISKY_ON_COMPUTER : undefined;
}
