// A remote device's decisions on a harness bridge's questions (HAL-10849).
// A phone names the bridge's own call id; the run answers the question under
// its own call id, the way a card click does, so the first answer wins.

import type { SendOptions } from "@halonicjs/ports";
import { InputRefused, type RefusalCode } from "../kernel/input-refused.ts";
import type { BridgeRemoteDecisions } from "./bridge-approvals.ts";

/** Why the kernel refuses a decision on a question that another answer, or the run's end, already took. */
const lostToAnotherAnswer: ReadonlySet<RefusalCode> = new Set([
  "engine.decision-callid-must-match",
  "engine.input-not-accepted",
]);

/** Why the kernel refuses a decision on a run that has ended: no question waits any more. */
const runEnded: RefusalCode = "engine.run-ended";

/** What a run's remote decisions need from the engine. */
export interface RemoteDecisionSource {
  /** The run's call id of the bridge's question, while it waits. */
  questionOf(bridgeCallId: string): string | undefined;
  /** Sends `approve` or `reject` to the run. */
  send(event: "approve" | "reject", options: SendOptions): Promise<unknown>;
}

/**
 * Takes a remote device's decisions on the questions of one run's bridge, as
 * a `send` to the question's own call id, marked `remote-device`. Nothing is
 * decided for a question that isn't waiting.
 */
export function remoteDecisionsOf(source: RemoteDecisionSource): BridgeRemoteDecisions {
  return {
    decide: async ({ callId, approved }) => {
      const question = source.questionOf(callId);
      if (question === undefined) return "unknown";
      try {
        await source.send(approved ? "approve" : "reject", {
          callId: question,
          by: "remote-device",
        });
        return "decided";
      } catch (error) {
        if (!(error instanceof InputRefused)) throw error;
        // The run ended between the lookup and the send: no question waits.
        if (error.code === runEnded) return "unknown";
        // Another answer took the question between the lookup and the send.
        if (lostToAnotherAnswer.has(error.code)) return "already-decided";
        throw error;
      }
    },
  };
}
