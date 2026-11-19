import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

/**
 * What the instructions come from in the engine's `HarnessAgent`: its hub and
 * the text and skills its file names. The engine's own type has more, and fits.
 */
export interface InstructionsAgent {
  readonly hubId: string;
  readonly file: { readonly instructions: string; readonly skills: readonly string[] };
}

/** A run's instructions, open in the host: the engine's `OpenInstructions`. */
export interface HostInstructions {
  readonly pin: {
    readonly files: readonly { readonly path: string; readonly sha256: string }[];
    readonly sha256: string;
  };
  readonly folder: string;
  release(): Promise<void>;
}

/** What the stand-in needs besides the transport. */
export interface AgentHostInstructionsOptions {
  /** The workspace the agents run in; the host serves it only when the launcher named it. */
  readonly workspace: string;
  /** The text of a skill's `SKILL.md`, as the run's workspace has it. Throws when there is none. */
  skillTextOf(agent: InstructionsAgent, skillId: string): Promise<string>;
}

const path = s.string().min(1);
const digest = s.string().regex(/^sha256:[0-9a-f]{64}$/u);
const openedAnswer = s
  .object({
    folder: path,
    pin: s.object({ digest, files: s.record(path, digest) }).strict(),
  })
  .strict();
const nothing = s.object({}).strict();

/**
 * The engine's `HarnessInstructionSource`, as a stand-in for the one the agent
 * host runs: the folder is in Halonic's data folder, which a page can't
 * write. The page reads the agent's `AGENTS.md` and skills and sends their
 * text; the host picks the folder, writes the files read-only and pins what
 * it wrote, as `RunInstructions` does for the CLI.
 *
 * @example
 * const instructions = new AgentHostInstructions(transport, { workspace, skillTextOf });
 * const open = await instructions.open(agent); // null when the agent has no instructions and no skills
 * try { start(open?.folder); } finally { await open?.release(); }
 */
export class AgentHostInstructions {
  readonly #transport: AgentHostTransport;
  readonly #options: AgentHostInstructionsOptions;

  constructor(transport: AgentHostTransport, options: AgentHostInstructionsOptions) {
    this.#transport = transport;
    this.#options = options;
  }

  /**
   * @throws {@link AgentHostError} `instructions_refused` with the host's reason, or `unknown_workspace`
   * @throws when a skill has no text
   */
  async open(agent: InstructionsAgent): Promise<HostInstructions | null> {
    const files = await this.#filesOf(agent);
    if (files.length === 0) return null;
    const route = "POST /v1/harnesses/instructions";
    const answer = await this.#transport.request(route, {
      workspace: this.#options.workspace,
      files,
    });
    const { folder, pin } = readAnswer(route, answer, openedAnswer);
    return {
      pin: {
        files: Object.entries(pin.files).map(([name, sha256]) => ({ path: name, sha256 })),
        sha256: pin.digest,
      },
      folder,
      // A folder that can't be released is left for the host to clear when it stops.
      release: () => this.#release(folder).catch(() => undefined),
    };
  }

  async #release(folder: string): Promise<void> {
    const route = "POST /v1/harnesses/instructions/release";
    readAnswer(route, await this.#transport.request(route, { folder }), nothing);
  }

  async #filesOf(agent: InstructionsAgent): Promise<{ name: string; text: string }[]> {
    const files: { name: string; text: string }[] = [];
    if (agent.file.instructions.trim() !== "") {
      files.push({ name: "AGENTS.md", text: agent.file.instructions });
    }
    for (const id of agent.file.skills) {
      files.push({
        name: `skills/${id}/SKILL.md`,
        text: await this.#options.skillTextOf(agent, id),
      });
    }
    return files;
  }
}
