// Which harness agents `halonic doctor` doesn't ask about their own sign-in
// (HAL-14661): those whose runs get a provider key Halonic keeps. It decides
// as `run` does, with the person's placement choice for the agent's file as
// it is on disk and the access `run`'s own key services would give, so doctor
// and run can't disagree. It also keeps the keys those runs get, so doctor
// can check that each is saved (HAL-15086).

import type { DoctorWorkspace, PlacementReader, UsedSecret } from "@halonicjs/app";
import type { AccessAgent, ProviderAccessChoice } from "@halonicjs/host-harness-host";
import { filesOf, type LoadedFileOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { comparedName } from "./doctor-workspace.ts";

/** What {@link agentsWithProviderKey} reads. */
export interface ProviderKeyAgentsInput {
  readonly workspace: LoadedWorkspace;
  /** Where each agent runs, as the person chose on this computer. */
  readonly placement: PlacementReader;
  /** The workspace's resolved real path, as placement choices are keyed. */
  readonly location: string;
  /** The raw bytes of a workspace file, by its workspace-relative path. */
  readFile(path: string): Promise<Uint8Array>;
  /** The access `run`'s bridge would give the agent: `ProviderKeyServices.accessFor` of `run`'s own services. */
  access(agent: AccessAgent): Promise<ProviderAccessChoice>;
}

/** A provider key `run` gives a harness agent: the provider's id and the secret that holds the key. */
export interface HarnessProviderKey {
  readonly provider: string;
  readonly secret: string;
}

/** What {@link agentsWithProviderKey} finds. */
export interface ProviderKeyAgents {
  /** The ids of the harness agents whose runs here get a provider key instead of their own sign-in. */
  readonly agents: ReadonlySet<string>;
  /**
   * Each key a harness agent's run here gets, in any hub, once by provider:
   * the run stops when it isn't saved, so doctor checks it.
   */
  readonly keys: readonly HarnessProviderKey[];
}

/**
 * The ids of the harness agents whose runs here get a provider key instead
 * of their own sign-in, and the keys they get. An agent `doctor` can't
 * decide for, because its file can't be read or `run` would stop on its
 * provider, isn't one of them, so the Harnesses line still asks about its
 * sign-in. An id two hubs use is one
 * only when both agents get a key: they share one settings folder.
 *
 * @example
 * await agentsWithProviderKey({ workspace, placement, location: "/work/acme", readFile, access });
 * // { agents: Set { "writer" }, keys: [{ provider: "claude", secret: "anthropic-key" }] }
 */
export async function agentsWithProviderKey(
  input: ProviderKeyAgentsInput,
): Promise<ProviderKeyAgents> {
  const agents = filesOf(input.workspace, "agent");
  const keysByAgent = await Promise.all(agents.map((file) => providerKeysOf(input, file)));
  const signIn = new Set(
    agents.filter((_, index) => !keyedEverywhere(keysByAgent[index])).map((file) => file.value.id),
  );
  const keys = new Map<string, HarnessProviderKey>();
  for (const key of keysByAgent.flatMap((agentKeys) => agentKeys ?? [])) {
    if (key !== undefined && !keys.has(key.provider)) keys.set(key.provider, key);
  }
  return {
    agents: new Set(
      agents.filter((file) => !signIn.has(file.value.id)).map((file) => file.value.id),
    ),
    keys: [...keys.values()],
  };
}

/** Whether the agent gets a key in every hub it can run in. */
function keyedEverywhere(keys: readonly (HarnessProviderKey | undefined)[] | undefined): boolean {
  return keys?.every((key) => key !== undefined) === true;
}

/**
 * The key `run` gives the agent in `file` in each hub it can run in: its
 * own, or each hub of the workspace for an agent at the root, whose choice
 * is kept per hub. An entry is `undefined` where the run uses the program's
 * own sign-in instead; the whole is `undefined` for an agent in Halonic's
 * loop, in no hub, or when it can't tell.
 */
async function providerKeysOf(
  input: ProviderKeyAgentsInput,
  file: LoadedFileOf<"agent">,
): Promise<(HarnessProviderKey | undefined)[] | undefined> {
  const { harness } = file.value;
  if (harness === undefined || harness === "halonic") return undefined;
  const hubs = file.hub === null ? hubsOf(input.workspace) : [file.hub];
  if (hubs.length === 0) return undefined;
  try {
    return await Promise.all(hubs.map((hub) => keyInHub(input, file, harness, hub)));
  } catch {
    return undefined;
  }
}

/** The provider key `run` gives the agent in `file` when it runs in `hub`, if it gives one. */
async function keyInHub(
  input: ProviderKeyAgentsInput,
  file: LoadedFileOf<"agent">,
  harness: AccessAgent["harness"],
  hub: string,
): Promise<HarnessProviderKey | undefined> {
  const answer = await input.placement.where({
    location: input.location,
    hub,
    agent: file.value.id,
    file: await input.readFile(file.path),
  });
  const { model } = file.value;
  const choice = await input.access({
    harness,
    runsOn: answer.runsOn,
    hubId: hub,
    ...(model === undefined ? {} : { model }),
  });
  return choice.kind === "key" ? { provider: choice.providerId, secret: choice.secret } : undefined;
}

/** The ids of the workspace's hubs, each once. */
function hubsOf(workspace: LoadedWorkspace): string[] {
  return [...new Set(filesOf(workspace, "hub").map((file) => file.hub))].filter(
    (hub): hub is string => hub !== null,
  );
}

/**
 * `workspace` with each key in `keys` that the Models line doesn't check
 * added to its secrets, used by its provider, so the Secrets line says when
 * it isn't saved (HAL-15086). A harness agent without a `model` gets the key
 * of the only keyed provider of its program's type, which no alias may use:
 * without this, `doctor` would say nothing while its run stops on the key.
 *
 * @example
 * withHarnessProviderKeys(workspace, [{ provider: "claude", secret: "anthropic-key" }]);
 * // { …workspace, secrets: [{ secret: "anthropic-key", usedBy: [{ kind: "provider", id: "claude" }] }] }
 */
export function withHarnessProviderKeys(
  workspace: DoctorWorkspace,
  keys: readonly HarnessProviderKey[],
): DoctorWorkspace {
  if (keys.length === 0) return workspace;
  const checkedByModels = new Set(
    workspace.providers.flatMap((provider) =>
      provider.runs === "with-a-key" ? [comparedName(provider.secret)] : [],
    ),
  );
  const secrets: UsedSecret[] = (workspace.secrets ?? []).map((entry) => ({
    ...entry,
    usedBy: [...entry.usedBy],
  }));
  for (const { provider, secret } of keys) {
    const name = comparedName(secret);
    if (checkedByModels.has(name)) continue;
    const user = { kind: "provider", id: provider } as const;
    const known = secrets.find((entry) => comparedName(entry.secret) === name);
    if (known === undefined) {
      secrets.push({ secret, usedBy: [user] });
    } else if (!known.usedBy.some((each) => each.kind === "provider" && each.id === provider)) {
      known.usedBy.push(user);
    }
  }
  return { ...workspace, secrets };
}
