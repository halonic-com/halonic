// The checks before the host opens a session without the sandbox for an
// agent a person set to "On this computer" (HAL-13195). Studio's page asks
// for the session; everything it says is a claim, so the host reads the
// agent's file, the person's trust record and the person's choice from disk
// itself, and opens only with a profile it built for that agent.

import { pinInstructions } from "@halonicjs/adapter-harness-kit";
import { AgentPlacement, InstructionTrustService } from "@halonicjs/app";
import type { Agent } from "@halonicjs/format";
import {
  type AgentPlacementStore,
  type Clock,
  type Digest,
  type InstructionPin,
  type InstructionTrustStore,
  instructionTrustKey,
  type SandboxProfile,
  type TrustStore,
} from "@halonicjs/ports";
import { canonicalJson } from "@halonicjs/std";
import type { HostRunInstructions } from "../harness/host-instructions.ts";
import type { BuiltProfile, HostHarnessProfiles } from "../harness/host-profiles.ts";
import { namedWorkspace } from "../server/named-workspace.ts";
import { type AgentFile, agentFileOf } from "./agent-file.ts";
import { isAgentTrusted } from "./agent-trust.ts";

/** What Studio asks to open: the agent, by its workspace, hub and id, and the profile to open with. */
export interface UnfencedOpenRequest {
  readonly workspace: string;
  readonly hubId: string;
  readonly agentId: string;
  readonly profile: SandboxProfile;
}

/** Why the host won't open the session, as the route answers it. */
export interface UnfencedRefusal {
  readonly status: 403 | 404;
  readonly kind:
    | "unknown_workspace"
    | "unknown_agent"
    | "workspace_not_trusted"
    | "not_on_this_computer"
    | "profile_not_built"
    | "instructions_not_trusted";
  readonly message: string;
}

/** What the gate reads: the host's own records, never the page's. */
export interface UnfencedGateOptions {
  /** The folders the launcher named as workspaces. */
  readonly workspaceRoots: readonly string[];
  /** The trust records of the user's profile; `undefined` without a profile folder, so nothing passes. */
  readonly trustStore: TrustStore | undefined;
  /** The "this computer" choices in the user's profile. */
  readonly placements: AgentPlacementStore;
  /** The profiles this host built and no session has opened with yet. */
  readonly profiles: Pick<HostHarnessProfiles, "unopened">;
  /**
   * The instruction folders this host made, with what it wrote in each. A
   * profile built with any other folder, or one holding other texts than the
   * workspace's own files make, doesn't pass: the folder becomes Claude
   * Code's `--plugin-dir`, and a plugin's hooks, or a skill's `hooks:` and
   * `` !`command` `` lines, run without asking anyone.
   */
  readonly instructions: Pick<HostRunInstructions, "pinOf">;
  /**
   * The instructions a person trusted for each agent, in the user's profile:
   * `<profile>/instruction-trust`, the folder Studio's trust dialog writes
   * (`FileInstructionTrustStore`). `undefined` without a profile folder, so
   * no instructions folder passes. Neither the trust record nor the "On this
   * computer" choice covers the skills' texts, and the page's own check
   * counts for nothing here.
   */
  readonly instructionTrust: InstructionTrustStore | undefined;
  readonly digest: Digest;
  readonly clock: Clock;
}

/**
 * Decides whether the host may open a session without the sandbox. It passes
 * only when all of these hold, read by the host itself, in this order:
 *
 * 1. the workspace is one the launcher named (by real path), and has the agent;
 * 2. the person's trust record for the workspace lists the agent as its file
 *    is now (see {@link isAgentTrusted});
 * 3. the person chose "On this computer" for the agent's file as it is now
 *    (`AgentPlacement`, the same reader as the CLI's);
 * 4. the profile is one this host built for that agent and no session has
 *    opened with yet, field for field; only its environment may differ, by
 *    the variables the harness adds, which the run's start checks. It was
 *    built with no instructions folder, or with one this host made holding
 *    exactly the agent's instructions and skills as the workspace's own
 *    files on disk make them (the page sends the texts, so they count only
 *    when they are the workspace's);
 * 5. a person trusted those instructions as they are now, by the same pin
 *    and record as the engine's instruction trust check
 *    (`engine.harness-instructions-trust`); a skill changed on disk since,
 *    by a fenced agent or a `git pull`, doesn't pass.
 *
 * What it passes, the built profile with its agent and instructions folder,
 * is what the session keeps, so a run's start can be held to it
 * (`agent-host.unfenced-start`).
 */
export class UnfencedGate {
  readonly #options: UnfencedGateOptions;
  readonly #placement: AgentPlacement;
  readonly #instructionTrust: InstructionTrustService | undefined;

  constructor(options: UnfencedGateOptions) {
    this.#options = options;
    this.#placement = new AgentPlacement({
      store: options.placements,
      digest: options.digest,
      clock: options.clock,
    });
    this.#instructionTrust =
      options.instructionTrust === undefined
        ? undefined
        : new InstructionTrustService({ store: options.instructionTrust, clock: options.clock });
  }

  /** @returns the profile the host built, or why the session doesn't open */
  async check(request: UnfencedOpenRequest): Promise<BuiltProfile | UnfencedRefusal> {
    const root = await namedWorkspace(this.#options.workspaceRoots, request.workspace);
    if (root === undefined) {
      return refusal(
        404,
        "unknown_workspace",
        "The agent host was not told to serve this workspace.",
      );
    }
    const found = await agentFileOf(root, request.hubId, request.agentId);
    if (found === undefined) {
      return refusal(404, "unknown_agent", "This workspace has no such agent.");
    }
    if (!(await isAgentTrusted(this.#options.trustStore, root, found.agent))) {
      return refusal(
        403,
        "workspace_not_trusted",
        "This computer's trust record doesn't cover this agent as its file is now. Trust the workspace first.",
      );
    }
    const where = await this.#placement.where({
      location: root,
      hub: request.hubId,
      agent: request.agentId,
      file: found.bytes,
    });
    if (where.runsOn !== "this-computer") {
      return refusal(
        403,
        "not_on_this_computer",
        "Nobody chose On this computer for this agent's file as it is now, so it runs in the sandbox.",
      );
    }
    const built = this.#options.profiles.unopened(request.profile.tempFolder);
    if (built === undefined || !isBuiltFor(built, root, request, found.agent)) {
      return refusal(
        403,
        "profile_not_built",
        "The agent host didn't build this profile for this agent, or a session already opened with it.",
      );
    }
    const pin = await this.#workspacePinOf(built, found);
    if (pin === undefined) {
      return refusal(
        403,
        "profile_not_built",
        "The profile's instructions folder isn't one the agent host made from this workspace's own instructions and skills, so the agent doesn't leave the sandbox with it.",
      );
    }
    if (pin !== null && !(await this.#isTrustedByPerson(root, request, pin))) {
      return refusal(
        403,
        "instructions_not_trusted",
        "Nobody on this computer trusted this agent's instructions and skills as they are now, so it doesn't leave the sandbox with them.",
      );
    }
    return built;
  }

  /**
   * The pin of `built`'s instructions folder when this host made it holding
   * exactly what the agent's file and the workspace's skill files make.
   *
   * @returns `null` when `built` has no instructions folder, so there is
   * nothing to trust; `undefined` when its folder doesn't hold those
   */
  async #workspacePinOf(
    built: BuiltProfile,
    found: AgentFile,
  ): Promise<InstructionPin | null | undefined> {
    if (built.instructionsFolder === null) return null;
    const made = this.#options.instructions.pinOf(built.instructionsFolder);
    if (made === undefined || found.instructions === undefined) return undefined;
    const own = await pinInstructions(found.instructions);
    return made.digest === own.digest ? own : undefined;
  }

  /**
   * Whether the person's record trusts `pin` for the agent. Never rejects:
   * no store, a record it can't read, or anything but `trusted` is a no.
   */
  async #isTrustedByPerson(
    root: string,
    request: UnfencedOpenRequest,
    pin: InstructionPin,
  ): Promise<boolean> {
    if (this.#instructionTrust === undefined) return false;
    const key = instructionTrustKey(root, request.hubId, request.agentId);
    try {
      return (await this.#instructionTrust.check(key, pin)).kind === "trusted";
    } catch {
      return false;
    }
  }

  /**
   * Whether `built` still waits for its session. Call it right before the
   * open, in the same turn: the launcher's open takes the profile at once,
   * so of two requests with one profile only the first opens a session.
   */
  isStillUnopened(built: BuiltProfile): boolean {
    return this.#options.profiles.unopened(built.profile.tempFolder) === built;
  }
}

/** Whether `value` is a refusal rather than the built profile. */
export function isRefusal(value: BuiltProfile | UnfencedRefusal): value is UnfencedRefusal {
  return "kind" in value;
}

function refusal(
  status: UnfencedRefusal["status"],
  kind: UnfencedRefusal["kind"],
  message: string,
): UnfencedRefusal {
  return { status, kind, message };
}

/** Whether the host built `built` for this agent in this workspace, and the request's profile is it, environment aside. */
function isBuiltFor(
  built: BuiltProfile,
  root: string,
  request: UnfencedOpenRequest,
  agent: Agent,
): boolean {
  return (
    built.workspace === root &&
    built.agent.hubId === request.hubId &&
    built.agent.agentId === request.agentId &&
    built.agent.harness === agent.harness &&
    canonicalJson(withoutEnv(built.profile)) === canonicalJson(withoutEnv(request.profile))
  );
}

function withoutEnv(profile: SandboxProfile): Omit<SandboxProfile, "env"> {
  const { env: _env, ...rest } = profile;
  return rest;
}
