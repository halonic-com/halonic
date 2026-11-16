import type { GatewaySessionSource } from "@halonicjs/adapter-remote-gateway";
import type { RunTable } from "../harness/run-table.ts";
import type { RunLedger } from "./run-ledger.ts";

/**
 * The remote gateway's view of the host: the sessions and approvals of the
 * {@link RunLedger}, and answers and prompts that go to the run through
 * {@link RunTable.send}, the call Studio's own answers take
 * (requirement `agent-host.remote-gateway`). It can list, watch, answer an
 * approval and send a prompt, and nothing else.
 */
export function hostGatewaySource(ledger: RunLedger, runs: RunTable): GatewaySessionSource {
  return {
    list: () => ledger.list(),
    watch: (sessionId, afterSeq, onEvent) => ledger.watch(sessionId, afterSeq, onEvent),
    approvalRisk: (sessionId, approvalId) => ledger.approvalRisk(sessionId, approvalId),
    answerApproval: async (sessionId, approvalId, decision) => {
      const callId = ledger.callIdOf(sessionId, approvalId);
      if (callId === undefined) throw new Error("No approval with this id is waiting.");
      await runs.send(sessionId, { type: "approval", callId, approved: decision === "approve" });
    },
    sendPrompt: (sessionId, text) => runs.send(sessionId, { type: "answer", text }),
  };
}
