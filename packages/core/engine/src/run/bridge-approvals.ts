// The approvals a harness's bridge asks for (HAL-10849): Claude Code's own
// tool calls and Halonic's tools reach a person through the engine, the same
// way a harness event's approval does. The run records the question as
// `approval.requested` under a call id of its own and waits for `approve` or
// `reject`, so a card and a phone answer it the same way, and the first
// answer wins.

import type { BridgeApprovalDecision, BridgeApprovals } from "@halonicjs/ports";
import type { StopSignal } from "@halonicjs/std";
import type {
  HarnessAnswer,
  HarnessApprovals,
  HarnessEventLog,
  HarnessQuestion,
} from "../harness/run-harness-call.ts";
import { unlessStopped } from "../harness/unless-stopped.ts";

/** What the bridge is told when no harness call of the run can take the question. */
export const bridgeNoCallComment =
  "This run isn't running an agent that can be asked, so the answer is no.";

/** What the bridge is told when the run can't wait for the question, or the call stopped first. */
export const bridgeNotAskedComment = "Nobody could be asked, so the answer is no.";

/** The bridge approvals of an executor that runs no workflows: every request is no. */
export const noRunApprovals: BridgeApprovals = {
  request: async () => ({ approved: false, comment: bridgeNoCallComment }),
};

/**
 * What the engine says to a decision made on a remote device: it was taken,
 * no such question waits (it is unknown, or has ended), or another answer
 * came first. The same three words as the agent host client's `RemoteDecisionStatus`.
 */
export type BridgeDecisionStatus = "decided" | "unknown" | "already-decided";

/**
 * A decision made on a remote device on a question the bridge asked. It names
 * the bridge's own call id, which is all a phone is shown.
 */
export interface BridgeRemoteDecision {
  readonly callId: string;
  readonly approved: boolean;
}

/** Takes decisions on the questions of one run's bridge. Structurally the agent host client's `RemoteDecisions`. */
export interface BridgeRemoteDecisions {
  decide(decision: BridgeRemoteDecision): Promise<BridgeDecisionStatus>;
}

/** The remote decisions of an executor that runs no workflows: no question waits. */
export const noRunDecisions: BridgeRemoteDecisions = { decide: async () => "unknown" };

/** What one running harness call lets the bridge ask through. */
export interface AskingCall {
  /** Records the question in the run and waits for the person's answer. */
  readonly approvals: HarnessApprovals;
  /** The call's log, held while the question waits, as for a harness event's approval. */
  readonly log: Pick<HarnessEventLog, "whileHeld">;
  /** Told to stop when the engine or the run stops the call. */
  readonly stop: StopSignal;
}

/**
 * The bridge approvals of the runs of one engine. A harness call lists
 * itself here while it runs; a request finds the call by the run it is for.
 * A request with no call to ask through, or with more than one (the run
 * can't tell which one the program belongs to), is answered with no. Nothing
 * here ever answers yes by itself.
 */
export class RunBridgeApprovals {
  readonly #calls = new Map<string, Set<AskingCall>>();
  /** The run's call id of each question that waits, by run and then by the bridge's own call id. */
  readonly #asked = new Map<string, Map<string, string>>();

  /**
   * Lists a running harness call.
   *
   * @returns the function that takes the call off the list again, once it ended
   */
  add(runId: string, call: AskingCall): () => void {
    const calls = this.#calls.get(runId) ?? new Set<AskingCall>();
    calls.add(call);
    this.#calls.set(runId, calls);
    return () => {
      calls.delete(call);
      if (calls.size === 0 && this.#calls.get(runId) === calls) this.#calls.delete(runId);
    };
  }

  /**
   * The approvals of one run's bridge. A request asks through the run, one
   * question at a time: the call's log is held while a question waits, so
   * the next waits behind it.
   *
   * A request whose `signal` aborts rejects at once. A question already
   * asked stays in the run until a person answers it, so the log stays true
   * to what was asked; one still waiting its turn is dropped and never asked.
   * The program gets no yes from either.
   */
  of(runId: string): BridgeApprovals {
    return {
      request: async ({ callId, tool, args }, { signal }): Promise<BridgeApprovalDecision> => {
        const call = this.#onlyCallOf(runId);
        if (call === undefined) return { approved: false, comment: bridgeNoCallComment };
        signal.throwIfAborted();
        try {
          const { approved, comment } = await untilAborted(
            signal,
            call.log.whileHeld(() => {
              // Waiting its turn is not asking yet: a request withdrawn by now is never put to a person.
              signal.throwIfAborted();
              return unlessStopped(call.stop, this.#ask(runId, callId, call, { tool, args }));
            }),
          );
          // Only the answer goes to the bridge: what the run's answer carries besides is the engine's.
          return comment === undefined ? { approved } : { approved, comment };
        } catch (error) {
          if (signal.aborted) throw error;
          return { approved: false, comment: bridgeNotAskedComment };
        }
      },
    };
  }

  /**
   * The run's call id of the question the bridge asked under its own `callId`,
   * while it waits; `undefined` for one never asked, or already answered.
   */
  engineCallIdOf(runId: string, bridgeCallId: string): string | undefined {
    return this.#asked.get(runId)?.get(bridgeCallId);
  }

  /** Asks through the call, and lists the question while it waits, even when its request was aborted. */
  async #ask(
    runId: string,
    bridgeCallId: string,
    call: AskingCall,
    question: HarnessQuestion,
  ): Promise<HarnessAnswer> {
    const asked = this.#asked.get(runId) ?? new Map<string, string>();
    this.#asked.set(runId, asked);
    try {
      return await call.approvals.ask(question, (engineCallId) =>
        asked.set(bridgeCallId, engineCallId),
      );
    } finally {
      asked.delete(bridgeCallId);
      if (asked.size === 0 && this.#asked.get(runId) === asked) this.#asked.delete(runId);
    }
  }

  #onlyCallOf(runId: string): AskingCall | undefined {
    const calls = this.#calls.get(runId);
    if (calls === undefined || calls.size !== 1) return undefined;
    return [...calls][0];
  }
}

/** Waits for `work` unless `signal` aborts first, which rejects with its reason. */
async function untilAborted<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  const aborted = Promise.withResolvers<never>();
  const onAbort = (): void => aborted.reject(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  work.catch(() => undefined); // an abort leaves the question to its run
  try {
    return await Promise.race([work, aborted.promise]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
