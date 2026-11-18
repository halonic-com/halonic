import type { DeniedPathGroup } from "@halonicjs/events";
import { deniedPathGroupCodes } from "@halonicjs/events";
import type { HarnessBridge, SandboxProfile } from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

/**
 * What the profile builder reads of the engine's `HarnessAgent`: its ids and
 * harness, the working folder and sites its file names, and its proposal
 * folder. The engine's own type has more, and fits.
 */
export interface ProfileAgent {
  readonly runId: string;
  readonly hubId: string;
  readonly agentId: string;
  readonly harness: string;
  readonly file: {
    readonly workingFolder?: string | undefined;
    readonly allowedSites?: readonly string[] | undefined;
  };
  readonly filesFolder: string | null;
}

/** A sandbox profile with the groups its denied paths were built from: the engine's `HarnessProfile`. */
export interface BuiltProfile {
  readonly profile: SandboxProfile;
  readonly deniedGroups: readonly DeniedPathGroup[];
}

/** What the stand-in needs besides the transport. */
export interface AgentHostProfilesOptions {
  /** The workspace the agents run in; the host serves it only when the launcher named it. */
  readonly workspace: string;
  /** The id of a bridge open in the host, by the address and token the engine got for it. */
  bridgeIdOf(bridge: HarnessBridge): string | undefined;
}

const path = s.string().min(1);

const builtSchema = s
  .object({
    profile: s
      .object({
        workingFolder: path,
        tempFolder: path,
        settingsFolder: path.nullable(),
        readOnlyPaths: s.array(path),
        deniedPaths: s.array(path),
        reopenedPaths: s.array(path).optional(),
        env: s.record(s.string(), s.string()),
        network: s
          .object({
            bridge: s
              .discriminatedUnion("kind", [
                s
                  .object({
                    kind: s.literal("loopback"),
                    host: path,
                    port: s.number().int().min(1).max(65_535),
                  })
                  .strict(),
                s.object({ kind: s.literal("socket"), name: path, socketPath: path }).strict(),
              ])
              .nullable(),
            allowedSites: s.array(path),
          })
          .strict(),
        timeLimitMs: s.number().int().positive(),
      })
      .strict(),
    deniedGroups: s.array(
      s.object({ code: s.enum(deniedPathGroupCodes), paths: s.array(path) }).strict(),
    ),
  })
  .strict();

/**
 * The engine's `HarnessProfileBuilder`, as a stand-in for the one the agent
 * host runs: it reads folders on disk and resolves links, which a page
 * can't. Only the agent's working folder, sites and proposal folder go to the
 * host, and the bridge by id: never a token, a data folder or a variable, so
 * what the profile denies is the host's to say.
 *
 * @example
 * const profiles = new AgentHostProfiles(transport, { workspace, bridgeIdOf });
 * const { profile } = await profiles.profileOf(agent, bridge, null);
 */
export class AgentHostProfiles {
  readonly #transport: AgentHostTransport;
  readonly #options: AgentHostProfilesOptions;

  constructor(transport: AgentHostTransport, options: AgentHostProfilesOptions) {
    this.#transport = transport;
    this.#options = options;
  }

  /**
   * @throws {@link AgentHostError} `profile_refused` with the host's reason (a working folder
   *   outside the workspace, say), `unknown_workspace`, `unknown_harness` or `unknown_bridge`
   * @throws when the bridge isn't open in the host
   */
  async profileOf(
    agent: ProfileAgent,
    bridge: HarnessBridge,
    instructionsFolder: string | null,
  ): Promise<BuiltProfile> {
    const bridgeId = this.#options.bridgeIdOf(bridge);
    if (bridgeId === undefined) {
      throw new Error("The profile is built in the agent host, so its bridge must be open there.");
    }
    const route = "POST /v1/harnesses/profile";
    const answer = await this.#transport.request(route, {
      workspace: this.#options.workspace,
      agent: {
        runId: agent.runId,
        hubId: agent.hubId,
        agentId: agent.agentId,
        harness: agent.harness,
        workingFolder: agent.file.workingFolder ?? null,
        allowedSites: agent.file.allowedSites ?? [],
        filesFolder: agent.filesFolder,
      },
      bridge: bridgeId,
      instructionsFolder,
    });
    return readAnswer(route, answer, builtSchema) as BuiltProfile;
  }
}
