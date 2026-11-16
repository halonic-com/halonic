import type { GatewaySessionSource } from "@halonicjs/adapter-remote-gateway";
import type { DecideRemotely, RemoteDecisionStatus } from "../bridge/studio-services.ts";
import type { RunTable } from "../harness/run-table.ts";
import type { RunLedger } from "./run-ledger.ts";

/**
 * The remote gateway's view of the host: the sessions and approvals of the
 * {@link RunLedger}, and prompts that go to the run through
 * {@link RunTable.send}, the call Studio's own answers take
 * (requirement `agent-host.remote-gateway`). It can list, watch and send a
 * prompt. A phone's answer to an approval the bridge asked for goes to Studio
 * (see {@link decideAtStudio}). It refuses every other approval: an answer
 * through `send` would skip the engine's own decision on the call.
 */
export function hostGatewaySource(ledger: RunLedger, runs: RunTable): GatewaySessionSource {
  return {
    list: () => ledger.list(),
    watch: (sessionId, afterSeq, onEvent, onHistoryGone) =>
      ledger.watch(sessionId, afterSeq, onEvent, onHistoryGone),
    approvalRisk: (sessionId, approvalId) => ledger.approvalRisk(sessionId, approvalId),
    answerApproval: async (sessionId, approvalId, decision) => {
      const decide = ledger.remoteDeciderOf(sessionId, approvalId);
      if (decide === undefined) {
        // An answer through `runs.send` would skip the engine's own decision on the call.
        throw new Error("A phone can't answer this approval yet.");
      }
      await decideAtStudio(decide, decision === "approve");
    },
    sendPrompt: (sessionId, text) => runs.send(sessionId, { type: "answer", text }),
  };
}

/**
 * Tells Studio of a phone's decision on an approval at the bridge. Nothing
 * settles here: the ledger settles when the approval's own call ends with
 * the answer Studio's engine took, which is the first decision made.
 */
async function decideAtStudio(decide: DecideRemotely, approved: boolean): Promise<void> {
  let status: RemoteDecisionStatus;
  try {
    status = await decide(approved);
  } catch {
    throw new Error("Studio didn't take the decision. The approval still waits.");
  }
  if (status === "unknown") throw new Error("Studio has no approval waiting with this id.");
  if (status === "already-decided") throw new Error("This approval has already been decided.");
}
