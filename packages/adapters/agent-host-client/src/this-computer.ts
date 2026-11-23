import type {
  Sandbox,
  SandboxCapabilities,
  SandboxCheck,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import type { ProfileOwner } from "./harness-profiles.ts";
import { AgentHostSession, openedSchema } from "./sandbox.ts";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

/** What {@link AgentHostThisComputer} needs besides the transport. */
export interface AgentHostThisComputerOptions {
  /** The workspace the agents run in, as the launcher named it to the host. */
  readonly workspace: string;
  /** The agent a profile was built for: `AgentHostProfiles.agentOf`. */
  agentOf(profile: SandboxProfile): ProfileOwner | undefined;
}

const offeredSchema = s.object({ offered: s.boolean() }).strict();

/** Why the host opens no session on this computer, for logs and support: no screen shows it. */
const notOfferedReason =
  "This agent host can't start an agent outside the sandbox on this computer: it has no profile folder, or runs on Windows.";

/**
 * Whether the agent host can open a session on this computer at all
 * (`GET /v1/sandbox/this-computer`).
 *
 * @throws {@link AgentHostError} when the host refuses, or can't be reached
 */
export async function thisComputerOffered(transport: AgentHostTransport): Promise<boolean> {
  const route = "GET /v1/sandbox/this-computer";
  return readAnswer(route, await transport.request(route), offeredSchema).offered;
}

/**
 * The engine's `this-computer` sandbox, as a stand-in for the launcher the
 * agent host runs (`createHostSandbox`, as the CLI's). The host opens a
 * session only for an agent the person set to "On this computer", with a
 * profile it built, in a workspace they trust, and checks all of that on its
 * own records: this stand-in only names the agent and the profile. Create it
 * with {@link AgentHostThisComputer.connect}, which asks the host once
 * whether it offers such sessions; where it doesn't, the check fails with
 * `not-offered` and nothing opens.
 *
 * @example
 * const thisComputer = await AgentHostThisComputer.connect(transport, {
 *   workspace,
 *   agentOf: (profile) => profiles.agentOf(profile),
 * });
 * const sessions = { sandbox, "this-computer": thisComputer };
 */
export class AgentHostThisComputer implements Sandbox {
  /** Whether the host opens sessions on this computer, as it answered when this connected. */
  readonly offered: boolean;
  readonly #transport: AgentHostTransport;
  readonly #options: AgentHostThisComputerOptions;

  private constructor(
    transport: AgentHostTransport,
    options: AgentHostThisComputerOptions,
    offered: boolean,
  ) {
    this.#transport = transport;
    this.#options = options;
    this.offered = offered;
  }

  /**
   * @throws {@link AgentHostError} when the host refuses, or can't be reached
   */
  static async connect(
    transport: AgentHostTransport,
    options: AgentHostThisComputerOptions,
  ): Promise<AgentHostThisComputer> {
    return new AgentHostThisComputer(transport, options, await thisComputerOffered(transport));
  }

  async check(): Promise<SandboxCheck> {
    return this.offered
      ? { ok: true, reason: null, missing: [] }
      : { ok: false, reason: "not-offered", missing: [notOfferedReason] };
  }

  /** Files are the person's own and nothing fences the program. */
  capabilities(): SandboxCapabilities {
    return { files: "shared", strength: "none" };
  }

  /**
   * @throws when this stand-in's profile builder didn't build `profile`, before the host is asked
   * @throws {@link AgentHostError} with the host's kind: `not_offered`, the gate's own
   *   (`workspace_not_trusted`, `not_on_this_computer`, ...), `profile_not_built` or `sandbox_open_failed`
   */
  async open(profile: SandboxProfile, options?: { signal?: AbortSignal }): Promise<SandboxSession> {
    const agent = this.#options.agentOf(profile);
    if (agent === undefined) {
      throw new Error(
        "The agent host builds the profile of an agent on this computer, and it didn't build this one.",
      );
    }
    const route = "POST /v1/sandbox/this-computer/open";
    const body = { workspace: this.#options.workspace, ...agent, profile };
    const signal = options?.signal;
    const answer = await this.#transport.request(route, body, signal ? { signal } : {});
    const opened = readAnswer(route, answer, openedSchema);
    return new AgentHostSession(this.#transport, opened.session, profile, opened.fence);
  }
}
