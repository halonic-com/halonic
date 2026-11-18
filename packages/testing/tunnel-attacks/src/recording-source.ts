import type {
  GatewaySessionEvent,
  GatewaySessionSource,
  GatewayWatchResult,
} from "@halonicjs/adapter-remote-gateway";
import type { GatewaySession } from "@halonicjs/ports";

/** Something the gateway asked the host to do. */
export type SourceCall =
  | {
      readonly kind: "answer";
      readonly sessionId: string;
      readonly approvalId: string;
      readonly decision: string;
    }
  | { readonly kind: "prompt"; readonly sessionId: string; readonly text: string };

/**
 * The host's side of the gateway, in memory. It records every call that would
 * change something on the desktop (an answer to an approval, a prompt), so an
 * attack test can say that a hostile client changed nothing.
 */
export class RecordingSource implements GatewaySessionSource {
  /** Every answer and prompt the gateway passed on, in order. */
  readonly calls: SourceCall[] = [];
  /** How many watches are open now. */
  watching = 0;
  private readonly sessions: GatewaySession[] = [];
  private readonly approvals = new Map<string, "normal" | "risky">();

  addSession(id: string): void {
    this.sessions.push({
      id,
      title: `Session ${id}`,
      state: "waiting",
      lastSeq: 3,
      updatedAt: "2026-11-17T08:00:00Z",
    });
  }

  /** An approval that waits for an answer. */
  addApproval(sessionId: string, approvalId: string, risk: "normal" | "risky"): void {
    this.approvals.set(`${sessionId}/${approvalId}`, risk);
  }

  list(): readonly GatewaySession[] {
    return this.sessions;
  }

  watch(
    sessionId: string,
    _afterSeq: number,
    _onEvent: (event: GatewaySessionEvent) => void,
    _onHistoryGone: () => void,
  ): GatewayWatchResult {
    if (!this.sessions.some((session) => session.id === sessionId)) {
      return { kind: "unknown-session" };
    }
    this.watching++;
    let stopped = false;
    return {
      kind: "watching",
      stop: () => {
        if (!stopped) this.watching--;
        stopped = true;
      },
    };
  }

  approvalRisk(sessionId: string, approvalId: string): "normal" | "risky" | undefined {
    return this.approvals.get(`${sessionId}/${approvalId}`);
  }

  async answerApproval(
    sessionId: string,
    approvalId: string,
    decision: "approve" | "deny",
  ): Promise<void> {
    this.calls.push({ kind: "answer", sessionId, approvalId, decision });
    this.approvals.delete(`${sessionId}/${approvalId}`);
  }

  async sendPrompt(sessionId: string, text: string): Promise<void> {
    this.calls.push({ kind: "prompt", sessionId, text });
  }
}
