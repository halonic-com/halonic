import type { RunVersion } from "@halonicjs/events";
import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

/** The top-level run a folder is opened for, as the engine's `ProposalRun` names it. */
export interface ProposalFolderRun {
  readonly runId: string;
  readonly hubId: string;
  readonly workflowId: string;
  readonly version: RunVersion | null;
}

const folderAnswer = s.object({ folder: s.string().min(1).nullable() }).strict();
const nothing = s.object({}).strict();

/**
 * The engine's `RunProposalFolders` (it fits it), as a stand-in for the folders the agent
 * host makes: a worktree or a copy is made on disk, and git needs Node, which
 * a page doesn't have. Only the workspace it was made for and the run's ids
 * and version go to the host.
 *
 * @example
 * const folders = new AgentHostProposalFolders(transport, workspace);
 * const folder = await folders.open(run); // the run writes only here
 * await folders.end(run.runId);
 */
export class AgentHostProposalFolders {
  readonly #transport: AgentHostTransport;
  readonly #workspace: string;

  /** @param workspace - the workspace the runs are in; the host serves it only when the launcher named it */
  constructor(transport: AgentHostTransport, workspace: string) {
    this.#transport = transport;
    this.#workspace = workspace;
  }

  /**
   * @throws {@link AgentHostError} `proposal_refused` with the host's reason when the folder can't be
   *   made, or `unknown_workspace`
   */
  async open(run: ProposalFolderRun): Promise<string> {
    const { runId, hubId, workflowId, version } = run;
    const route = "POST /v1/proposals/open";
    const answer = await this.#transport.request(route, {
      workspace: this.#workspace,
      run: { runId, hubId, workflowId, version },
    });
    const { folder } = readAnswer(route, answer, folderAnswer);
    if (folder === null) throw new Error(`${route} answered without a folder.`);
    return folder;
  }

  async folderOf(runId: string): Promise<string | null> {
    const route = "POST /v1/proposals/folder-of";
    const answer = await this.#transport.request(route, { workspace: this.#workspace, runId });
    return readAnswer(route, answer, folderAnswer).folder;
  }

  /** Never throws: the run has ended, and a folder that can't be ended is cleared at the host's next start. */
  async end(runId: string): Promise<void> {
    await this.#transport
      .request("POST /v1/proposals/end", { workspace: this.#workspace, runId })
      .catch(() => undefined);
  }

  /**
   * At the engine's start, clears what runs that ended left, keeping the
   * folders of `openRuns`.
   */
  async start(openRuns: ReadonlySet<string>): Promise<void> {
    const route = "POST /v1/proposals/start";
    const answer = await this.#transport.request(route, {
      workspace: this.#workspace,
      openRuns: [...openRuns],
    });
    readAnswer(route, answer, nothing);
  }
}
