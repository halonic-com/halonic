/**
 * The answers the phone sent that the host hasn't settled yet (tunnel D7,
 * design on HAL-15159, section 3). An answer is never sent twice. When a drop
 * cuts one off before its `ok`, the phone learns what happened after the
 * reconnect: either the approval settles, or the session catches up to where
 * the host was when it listed it again, and the approval is still open, so
 * the answer never landed and the person may answer again.
 */

/** One answer on its way, or cut off by a drop. */
interface SentAnswer {
  readonly sessionId: string;
  readonly decision: "approve" | "deny";
  /** A drop cut it off before the host answered. */
  cutOff: boolean;
  /**
   * For a cut-off answer: the session's `lastSeq` in the first session list
   * after the reconnect. Once the phone holds that event, it knows.
   */
  catchUpTo: number | undefined;
}

/** The answers sent and not yet settled, by approval id. */
export class SentAnswers {
  private readonly answers = new Map<string, SentAnswer>();

  /** The decision sent for `approvalId`, while it is unsettled. */
  decisionFor(approvalId: string): "approve" | "deny" | undefined {
    return this.answers.get(approvalId)?.decision;
  }

  /** Records an answer just sent. */
  sent(approvalId: string, sessionId: string, decision: "approve" | "deny"): void {
    this.answers.set(approvalId, { sessionId, decision, cutOff: false, catchUpTo: undefined });
  }

  /** The host refused it, so nothing landed. */
  refused(approvalId: string): void {
    this.answers.delete(approvalId);
  }

  /** The approval settled, whoever answered it. */
  settled(approvalId: string): void {
    this.answers.delete(approvalId);
  }

  /** The connection dropped: every answer without its `ok` was cut off. */
  dropped(pending: Iterable<string>): void {
    for (const approvalId of pending) {
      const answer = this.answers.get(approvalId);
      if (answer !== undefined) answer.cutOff = true;
    }
  }

  /** The first session list after a reconnect: where each cut-off answer's session was. */
  listed(lastSeqOf: (sessionId: string) => number | undefined): void {
    for (const [approvalId, answer] of this.answers) {
      if (!answer.cutOff || answer.catchUpTo !== undefined) continue;
      const lastSeq = lastSeqOf(answer.sessionId);
      // A session that left the list took its approvals with it.
      if (lastSeq === undefined) this.answers.delete(approvalId);
      else answer.catchUpTo = lastSeq;
    }
  }

  /**
   * The phone now holds events of `sessionId` up to `heldSeq`. A cut-off
   * answer that hasn't settled by the session's listed `lastSeq` never
   * landed, so it is forgotten and the approval may be answered again.
   */
  caughtUp(sessionId: string, heldSeq: number): void {
    for (const [approvalId, answer] of this.answers) {
      if (answer.sessionId !== sessionId || answer.catchUpTo === undefined) continue;
      if (heldSeq >= answer.catchUpTo) this.answers.delete(approvalId);
    }
  }

  /** Forgets everything, as when the computer is removed. */
  clear(): void {
    this.answers.clear();
  }
}
