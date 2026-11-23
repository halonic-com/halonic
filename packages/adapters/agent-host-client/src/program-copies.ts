import { type ProgramCopyLease, ProgramCopyUnavailableError } from "@halonicjs/app";
import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const pathAnswer = s.object({ path: s.string().min(1) }).strict();
const nothing = s.object({}).strict();

/**
 * The agent host's program copies of one workspace (`agent-host.program-copy-routes`): a git
 * worktree at a commit, which a live run's connector programs start in, as the CLI's
 * `openProgramFolders` makes them. git needs Node, which a page doesn't have, so the host makes
 * them and the page only names the workspace and the commit.
 *
 * @example
 * const copies = new AgentHostProgramCopies(transport, workspace, reportError);
 * await copies.start(); // once the engine lock is held, before any run
 * const copy = await copies.open(commit); // the run's programs start in copy.path
 * await copy.release();
 */
export class AgentHostProgramCopies {
  readonly #transport: AgentHostTransport;
  readonly #workspace: string;
  readonly #reportError: (error: unknown) => void;

  /**
   * @param workspace - the workspace folder; the host copies it only when the launcher named it
   * @param reportError - hears a copy that couldn't be released, which the next start sweeps
   */
  constructor(
    transport: AgentHostTransport,
    workspace: string,
    reportError: (error: unknown) => void,
  ) {
    this.#transport = transport;
    this.#workspace = workspace;
    this.#reportError = reportError;
  }

  /**
   * Stops the workspace's connectors in the host and removes the copies an engine that stopped
   * left, as the CLI's engine does when it opens.
   *
   * @throws {@link AgentHostError} when the host refuses or can't be reached
   */
  async start(): Promise<void> {
    const route = "POST /v1/program-copies/start";
    const answer = await this.#transport.request(route, { workspace: this.#workspace });
    readAnswer(route, answer, nothing);
  }

  /**
   * A hold on the copy of the workspace at `commit`, which the host keeps until it is released.
   *
   * @throws {ProgramCopyUnavailableError} when the host can't make the copy or can't be reached:
   *   the run's programs never start in the workspace folder in its place
   */
  async open(commit: string): Promise<ProgramCopyLease> {
    const route = "POST /v1/program-copies/open";
    let path: string;
    try {
      const answer = await this.#transport.request(route, { workspace: this.#workspace, commit });
      path = readAnswer(route, answer, pathAnswer).path;
    } catch (error) {
      throw new ProgramCopyUnavailableError(commit, error);
    }
    let released = false;
    return {
      path,
      release: async () => {
        if (released) return;
        released = true;
        await this.#release(path).catch(this.#reportError);
      },
    };
  }

  async #release(path: string): Promise<void> {
    const route = "POST /v1/program-copies/release";
    const answer = await this.#transport.request(route, { workspace: this.#workspace, path });
    readAnswer(route, answer, nothing);
  }
}
