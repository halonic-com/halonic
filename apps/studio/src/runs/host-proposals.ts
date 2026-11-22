import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { AgentHostError, AgentHostRunProposals } from "@halonicjs/adapter-agent-host-client";
import type { ProposedRecord } from "@halonicjs/app";

/**
 * The workspace's open run proposals from the agent host, for
 * `WorkspaceRuns`' `proposals` (`studio.workspace-run-proposals`). A folder that isn't
 * trusted yet asks the host nothing, so opening one starts no host call. A host that
 * doesn't serve proposals here, because it has no profile folder (`not_found`)
 * or wasn't told to serve the workspace (`unknown_workspace`), keeps none for
 * it, so that lists none; any other failure is thrown, and the Inbox shows it.
 */
export function hostProposalsOf(
  transport: AgentHostTransport,
  location: string,
  trusted: () => boolean,
): () => Promise<readonly ProposedRecord[]> {
  const proposals = new AgentHostRunProposals(transport, location);
  return async () => {
    if (!trusted()) return [];
    try {
      return await proposals.list();
    } catch (error) {
      if (error instanceof AgentHostError && servesNone.has(error.kind)) return [];
      throw error;
    }
  };
}

const servesNone = new Set(["not_found", "unknown_workspace"]);
