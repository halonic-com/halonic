import type { GatewaySessionSource } from "@halonicjs/adapter-remote-gateway";
import type { RunTable } from "../harness/run-table.ts";
import type { RunLedger } from "./run-ledger.ts";

/**
 * The remote gateway's view of the host: the sessions and approvals of the
 * {@link RunLedger}, and prompts that go to the run through
 * {@link RunTable.send}, the call Studio's own answers take
 * (requirement `agent-host.remote-gateway`). It can list, watch and send a
 * prompt. It refuses every approval: an answer through `send` would skip the
 * engine's own decision on the call, so approvals reach the engine in a
 * follow-up, and until then a phone can't answer one.
 */
export function hostGatewaySource(ledger: RunLedger, runs: RunTable): GatewaySessionSource {
  return {
    list: () => ledger.list(),
    watch: (sessionId, afterSeq, onEvent, onHistoryGone) =>
      ledger.watch(sessionId, afterSeq, onEvent, onHistoryGone),
    approvalRisk: (sessionId, approvalId) => ledger.approvalRisk(sessionId, approvalId),
    answerApproval: async () => {
      throw new Error("A phone can't answer an approval yet.");
    },
    sendPrompt: (sessionId, text) => runs.send(sessionId, { type: "answer", text }),
  };
}
