import { gatewayMaxPromptLength } from "@halonicjs/ports";
import { phoneStatusLabel } from "../phone/phone-status.ts";
import {
  type PhoneRemote,
  RECONNECT_TO_ANSWER,
  type RemoteApproval,
  type RemoteSendOutcome,
  type RemoteSession,
  type RemoteView,
} from "../phone/remote-view.ts";

/** The computer every builder below names. */
export const FAKE_COMPUTER = "Work laptop";

/** A running session with no events, with `overrides` on top. */
export function remoteSession(overrides: Partial<RemoteSession> = {}): RemoteSession {
  return {
    id: "session-1",
    title: "Weekly report",
    state: "running",
    updatedAt: "2026-11-21T14:02:00.000Z",
    events: [],
    droppedOlder: false,
    ...overrides,
  };
}

/** An open, answerable approval of a normal tool in `session-1`, with `overrides` on top. */
export function remoteApproval(overrides: Partial<RemoteApproval> = {}): RemoteApproval {
  return {
    sessionId: "session-1",
    approval: { id: "approval-1", summary: "Send 4 replies", risk: "normal" },
    requestedAt: "2026-11-21T14:01:00.000Z",
    canAnswer: true,
    offReason: undefined,
    answerOnComputer: false,
    sent: undefined,
    ...overrides,
  };
}

/** A live view of {@link FAKE_COMPUTER} with no sessions, with `overrides` on top. */
export function remoteView(overrides: Partial<RemoteView> = {}): RemoteView {
  return {
    label: phoneStatusLabel("connected", FAKE_COMPUTER),
    asOf: new Date(2026, 10, 21, 14, 2),
    sessions: [],
    openApprovals: [],
    canAnswer: true,
    offReason: undefined,
    answersRisky: false,
    updateNeeded: false,
    olderComputer: false,
    ...overrides,
  };
}

/**
 * `view` as it goes stale: the label of `state`, the same sessions and
 * approvals, and everything off with "You can answer once your phone reconnects.".
 */
export function staleView(view: RemoteView, state: "reconnecting" | "unreachable"): RemoteView {
  return {
    ...view,
    label: phoneStatusLabel(state, FAKE_COMPUTER),
    canAnswer: false,
    offReason: RECONNECT_TO_ANSWER,
    openApprovals: view.openApprovals.map((open) => ({
      ...open,
      canAnswer: false,
      offReason: RECONNECT_TO_ANSWER,
    })),
  };
}

/** One answer the screens sent. */
export interface FakeAnswer {
  readonly sessionId: string;
  readonly approvalId: string;
  readonly decision: "approve" | "deny";
}

/** One prompt the screens sent. */
export interface FakePrompt {
  readonly sessionId: string;
  readonly text: string;
}

/**
 * A {@link PhoneRemote} for the phone's screens and their tests. A test sets
 * the view with {@link show} and the host's answer with {@link answerWith}
 * and {@link promptWith}; the fake records what the screens sent. Like the
 * real client, it sends nothing that is off or invalid, and then doesn't
 * record it either.
 */
export class FakePhoneRemote implements PhoneRemote {
  /** The answers sent, oldest first. */
  readonly answers: FakeAnswer[] = [];
  /** The prompts sent, oldest first. */
  readonly prompts: FakePrompt[] = [];

  private current: RemoteView;
  private readonly listeners = new Set<() => void>();
  private answerOutcome: RemoteSendOutcome = { kind: "done" };
  private promptOutcome: RemoteSendOutcome = { kind: "done" };

  constructor(view: RemoteView = remoteView()) {
    this.current = view;
  }

  view(): RemoteView {
    return this.current;
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  /** Replaces the view and tells every subscriber. */
  show(view: RemoteView): void {
    this.current = view;
    for (const onChange of [...this.listeners]) onChange();
  }

  /** What the next answers that get sent come back with; `done` until set. */
  answerWith(outcome: RemoteSendOutcome): void {
    this.answerOutcome = outcome;
  }

  /** What the next prompts that get sent come back with; `done` until set. */
  promptWith(outcome: RemoteSendOutcome): void {
    this.promptOutcome = outcome;
  }

  async answer(
    sessionId: string,
    approvalId: string,
    decision: "approve" | "deny",
  ): Promise<RemoteSendOutcome> {
    const open = this.current.openApprovals.find(
      (candidate) => candidate.sessionId === sessionId && candidate.approval.id === approvalId,
    );
    if (open !== undefined && (!this.current.canAnswer || !open.canAnswer)) {
      return { kind: "not-sent", reason: "off" };
    }
    this.answers.push({ sessionId, approvalId, decision });
    return this.answerOutcome;
  }

  async prompt(sessionId: string, text: string): Promise<RemoteSendOutcome> {
    if (!this.current.canAnswer) return { kind: "not-sent", reason: "off" };
    if (text.length === 0 || text.length > gatewayMaxPromptLength) {
      return { kind: "not-sent", reason: "invalid" };
    }
    this.prompts.push({ sessionId, text });
    return this.promptOutcome;
  }
}
