/**
 * Builds the {@link RemoteView} the screens show from what the gateway client
 * holds (tunnel D7, design on HAL-15159, sections 2 and 3).
 */

import type { GatewaySession } from "@halonicjs/ports";
import { type PhoneState, phoneStatusLabel } from "./phone-status.ts";
import {
  type OwnerCheckHint,
  RECONNECT_TO_ANSWER,
  type RemoteApproval,
  type RemoteSession,
  type RemoteView,
  UPDATE_TO_ANSWER,
  waitForComputerToAnswer,
} from "./remote-view.ts";
import type { SentAnswers } from "./sent-answers.ts";
import type { SessionMemory } from "./session-memory.ts";

/**
 * Why Approve and Reject are off for a `risky` approval: the phone answers one
 * only while the computer's switch "Let phones answer risky approvals" is on
 * and the phone's owner check can ask (board decision 4b, HAL-15194). Interim
 * words: the final ones are a wording call with Elena and Sofia.
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
  /**
   * Whether the phone's owner check could ask for an approval, checked again
   * after the last session list arrived. `unknown` until that check answers.
   */
  readonly ownerCheck: OwnerCheckHint;
  /** The same for an Inbox answer, which the phone's PIN passes too. */
  readonly answerCheck: OwnerCheckHint;
  /** The last connection found the two sides on different message versions. */
  readonly updateNeeded: boolean;
  /** The last `welcome` was version 3's, after the computer refused version 4. */
  readonly olderComputer: boolean;
}

/** The view of `holding`: live only while connected and listed since the last `welcome`. */
export function viewOf(holding: ClientHolding): RemoteView {
  const live = holding.state === "connected" && holding.listed;
  const risky = answersRiskyOnPhone(holding);
  const notLiveReason = holding.updateNeeded ? UPDATE_TO_ANSWER : RECONNECT_TO_ANSWER;
  return {
    label: phoneStatusLabel(holding.state, holding.computer),
    asOf: holding.asOf,
    sessions: holding.sessions.map((session) => sessionOf(session, holding.memories)),
    openApprovals: openApprovalsOf(holding, live, risky, notLiveReason),
    canAnswer: live,
    offReason: live ? undefined : viewOffReason(holding, notLiveReason),
    answersRisky: holding.answersRisky,
    ownerCheck: holding.ownerCheck,
    answerCheck: holding.answerCheck,
    updateNeeded: holding.updateNeeded,
    olderComputer: holding.olderComputer,
  };
}

/**
 * Why the view's answers are off while it isn't live: p03g while the computer is the one not
 * answering, else the approvals' own reason. Only the Inbox card reads it.
 */
function viewOffReason(holding: ClientHolding, notLiveReason: string): string {
  if (holding.state === "unreachable" && notLiveReason === RECONNECT_TO_ANSWER) {
    return waitForComputerToAnswer(holding.computer);
  }
  return notLiveReason;
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
  risky: RiskyOnPhone,
  notLiveReason: string,
): RemoteApproval[] {
  const approvals = holding.sessions.flatMap((session) =>
    (holding.memories.get(session.id)?.openApprovals ?? []).map(
      ({ approval, requestedAt }): RemoteApproval => {
        const sent = holding.sentAnswers.decisionFor(approval.id);
        const answerOnComputer = approval.risk === "risky" && risky === "on-computer";
        const onComputerReason = answerOnComputer ? ANSWER_RISKY_ON_COMPUTER : undefined;
        const offReason = live ? onComputerReason : notLiveReason;
        return {
          sessionId: session.id,
          approval,
          requestedAt,
          canAnswer: offReason === undefined && sent === undefined,
          offReason,
          answerOnComputer,
          sent,
        };
      },
    ),
  );
  return approvals.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

/** Where a `risky` approval is answered: on the phone, or only on the computer. */
type RiskyOnPhone = "on-phone" | "on-computer";

/**
 * A `risky` approval gets Approve and Reject on the phone only while both hold:
 * the computer's last list said its switch is on, and the owner check can ask.
 * Both are only hints for what to show: the shell asks the owner check and the
 * computer checks its switch again for every answer.
 */
function answersRiskyOnPhone(holding: ClientHolding): RiskyOnPhone {
  return holding.answersRisky && holding.ownerCheck === "ready" ? "on-phone" : "on-computer";
}
