// What `halonic doctor` reads from the workspace it runs in: its name, what
// the trust check covers, its model aliases and the providers they use. The
// doctor service asks the machine about them; this only reads the files.

import type { AliasProvider, DoctorProvider, DoctorWorkspace } from "@halonicjs/app";
import type { Provider } from "@halonicjs/format";
import {
  filesOf,
  type LoadedWorkspace,
  type LocalIntegrationInput,
  modelAliases,
  reachesOnlyTheTestModel,
} from "@halonicjs/workspace";
import { trustContentInputOf, trustSubjectOf } from "./workspace-trust.ts";

/**
 * Where a model server on this computer answers when its provider file
 * gives no `baseUrl`, by provider type. The addresses are the servers' own
 * defaults, as the example providers write them.
 */
const defaultAddresses: Readonly<Record<string, string>> = {
  ollama: "localhost:11434",
  lmstudio: "localhost:1234",
};

/** What {@link doctorWorkspace} reads. */
export interface DoctorWorkspaceInput {
  /** The workspace, loaded. Files with an error are left out, as `loadWorkspace` does. */
  readonly workspace: LoadedWorkspace;
  /** The workspace's local integrations, as every command that checks trust reads them. */
  readonly integrations: readonly LocalIntegrationInput[];
  /** The workspace's resolved real path: the trust record's key. */
  readonly location: string;
  /** The name to show when `workspace.yaml` has none or didn't parse: the folder's own name. */
  readonly fallbackName: string;
  /** The absolute path each connector's command resolves to on this computer. */
  readonly commandPaths: ReadonlyMap<string, string>;
}

/**
 * The workspace as the doctor service checks it.
 *
 * - **Trust:** what {@link trustSubjectOf} reads, the same for every command
 *   that checks trust.
 * - **Aliases:** those of `models.yaml` in its order, then each hub's own
 *   that point somewhere new, so a hub's alias without a key is warned
 *   about too.
 * - **Providers:** each one an alias uses, once, with how it runs (see
 *   {@link doctorProvider}). One that has no file is left out, with its
 *   aliases: `halonic validate` reports it.
 *
 * @example
 * doctorWorkspace({ workspace, integrations: [], location: "/work/acme", fallbackName: "acme", commandPaths });
 * // { name: "Acme", trust: { … }, aliases: [{ alias: "smart", provider: "anthropic" }], providers: [ … ] }
 */
export function doctorWorkspace(input: DoctorWorkspaceInput): DoctorWorkspace {
  const { workspace } = input;
  const settings = filesOf(workspace, "workspace")[0]?.value;
  const allAliases = workspaceAliases(workspace);
  const providers = usedProviders(workspace, allAliases);
  // The Models line takes only aliases whose provider it was given.
  const listed = new Set(providers.map((provider) => provider.provider));
  return {
    name: settings?.name ?? input.fallbackName,
    trust: trustSubjectOf(input),
    aliases: allAliases.filter((alias) => listed.has(alias.provider)),
    providers,
    // The rule `run` skips trust by, so doctor doesn't ask for a trust `run` wouldn't.
    testModelOnly: reachesOnlyTheTestModel(trustContentInputOf(workspace, input.integrations)),
  };
}

/**
 * How Halonic reaches a provider, from its file alone:
 *
 * - **The test model** (`mock`) needs nothing, so `doctor` doesn't list it.
 * - **A model server on this computer** (`local: true`) answers at its
 *   `baseUrl`, or at the server's default address.
 * - **Any other provider** with a `secret` needs the key in that secret;
 *   without one, it needs no key.
 *
 * @returns `undefined` for a server on this computer whose address Halonic
 *   doesn't know: it has no `baseUrl`, and its type has no default address.
 *   `doctor` can't ask it anything, so it isn't listed.
 *
 * @example
 * doctorProvider({ id: "ollama", type: "ollama", baseUrl: "http://localhost:11434/v1", local: true, … });
 * // { provider: "ollama", name: "Ollama", runs: "on-this-computer", address: "localhost:11434" }
 */
export function doctorProvider(provider: Provider): DoctorProvider | undefined {
  const named = { provider: provider.id, name: provider.name ?? provider.id };
  if (provider.type === "mock") {
    return { ...named, runs: "without-a-key" };
  }
  if (provider.local) {
    const address = providerAddress(provider);
    return address === undefined ? undefined : { ...named, runs: "on-this-computer", address };
  }
  if (provider.secret !== undefined) {
    return { ...named, runs: "with-a-key", secret: provider.secret };
  }
  return { ...named, runs: "without-a-key" };
}

/**
 * "localhost:11434": the host and port of `baseUrl`, never its path, or else
 * the default address of the provider's type.
 */
export function providerAddress(provider: Provider): string | undefined {
  if (provider.baseUrl !== undefined) {
    return new URL(provider.baseUrl).host;
  }
  return defaultAddresses[provider.type];
}

/**
 * The API address of a model server on this computer whose provider file
 * gives no `baseUrl`, from the same table as {@link providerAddress}, or
 * `undefined` when its type has no default address.
 *
 * @example
 * defaultLocalBaseUrl("ollama"); // "http://localhost:11434/v1"
 */
export function defaultLocalBaseUrl(type: string): string | undefined {
  const address = defaultAddresses[type];
  return address === undefined ? undefined : `http://${address}/v1`;
}

/** The root's aliases, then each hub's that adds an alias or points one elsewhere. */
function workspaceAliases(workspace: LoadedWorkspace): AliasProvider[] {
  const hubs = [...new Set(filesOf(workspace, "hub").map((file) => file.hub))];
  const aliases: AliasProvider[] = [];
  const seen = new Set<string>();
  for (const hub of [null, ...hubs]) {
    for (const [alias, target] of modelAliases(workspace, hub)) {
      // The alias and its provider, joined with a character an id can't hold.
      const key = `${alias}\n${target.provider}`;
      if (!seen.has(key)) {
        seen.add(key);
        aliases.push({ alias, provider: target.provider });
      }
    }
  }
  return aliases;
}

/** Every provider the aliases use, in the order they're first used, that has a file. */
function usedProviders(
  workspace: LoadedWorkspace,
  aliases: readonly AliasProvider[],
): DoctorProvider[] {
  const files = new Map(filesOf(workspace, "provider").map((file) => [file.value.id, file.value]));
  const used = [...new Set(aliases.map((alias) => alias.provider))];
  return used.flatMap((id) => {
    const file = files.get(id);
    const provider = file === undefined ? undefined : doctorProvider(file);
    return provider === undefined ? [] : [provider];
  });
}
