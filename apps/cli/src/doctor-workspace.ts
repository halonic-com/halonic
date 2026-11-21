// What `halonic doctor` reads from the workspace it runs in: its name, what
// the trust check covers, its model aliases and the providers they use. The
// doctor service asks the machine about them; this only reads the files.

import { defaultLocalAddress, startsAProgram } from "@halonicjs/adapter-workspace-models";
import {
  type AliasProvider,
  type DoctorProvider,
  type DoctorWorkspace,
  trustContentInputOf,
  trustSubjectOf,
  type UsedSecret,
} from "@halonicjs/app";
import type { Connector, Provider } from "@halonicjs/format";
import { isSecretName, secretKey } from "@halonicjs/ports";
import {
  callModelName,
  definitionsOf,
  filesOf,
  type LoadedWorkspace,
  type LocalIntegrationInput,
  modelAliases,
  reachesOnlyTheTestModel,
  resolveModel,
} from "@halonicjs/workspace";
import { fileProblemsOf } from "./workspace-problems.ts";

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
 *   about too. Then each `provider/model` an agent names directly whose
 *   provider no alias uses, such as `claude/claude-sonnet-5-5`, so its key
 *   is checked too, with the same words (HAL-14661).
 * - **Providers:** each one those use, once, in the order they're first
 *   used, with how it runs (see {@link doctorProvider}). One that has no
 *   file is left out, with its aliases: `halonic validate` reports it.
 * - **Secrets:** each one a run needs that the Models line doesn't check,
 *   with what uses it (see {@link usedSecrets}).
 * - **Default model:** the workspace's, when it is an alias no file has and
 *   something would call it (see {@link missingDefaultModel}).
 * - **File problems:** the errors `halonic validate` finds. Each leaves a
 *   file out, so a workspace with any is never on the test model only:
 *   the file left out may be a provider's (HAL-6613).
 *
 * @example
 * doctorWorkspace({ workspace, integrations: [], location: "/work/acme", fallbackName: "acme", commandPaths });
 * // { name: "Acme", trust: { … }, aliases: [{ alias: "smart", provider: "anthropic" }], providers: [ … ] }
 */
export function doctorWorkspace(input: DoctorWorkspaceInput): DoctorWorkspace {
  const { workspace } = input;
  const settings = filesOf(workspace, "workspace")[0]?.value;
  const allAliases = withDirectModels(workspaceAliases(workspace), workspace);
  const providerFiles = usedProviderFiles(workspace, allAliases);
  const providers = providerFiles.flatMap((file) => doctorProvider(file) ?? []);
  // The Models line takes only aliases whose provider it was given.
  const listed = new Set(providers.map((provider) => provider.provider));
  const fileProblems = fileProblemsOf(workspace);
  return {
    name: settings?.name ?? input.fallbackName,
    trust: trustSubjectOf(input),
    aliases: allAliases.filter((alias) => listed.has(alias.provider)),
    providers,
    secrets: usedSecrets(workspace, providerFiles),
    ...missingDefaultModel(workspace, fileProblems, allAliases),
    // The rule `run` skips trust by, so doctor doesn't ask for a trust `run` wouldn't.
    testModelOnly:
      fileProblems === 0 &&
      reachesOnlyTheTestModel(trustContentInputOf(workspace, input.integrations)),
    ...(fileProblems === 0 ? {} : { fileProblems }),
    ...(settings?.privacy.localOnly === true ? { localOnly: true } : {}),
  };
}

/**
 * The workspace's default model (`defaults.model`, else `default`) when it is
 * an alias the root has no file for and something would call it: the
 * workspace has no model alias at all, as after plain `halonic init`, or an
 * agent that names no model gets it (HAL-14301, Nina's C340 check). An agent
 * in a hub with its own default, or whose harness starts a program, doesn't.
 * Not while the files have errors: the alias may be in a file that failed,
 * and the Workspace line already sends the user to `halonic validate`. A
 * default with a `/` names a provider and a model directly, and isn't an alias.
 */
function missingDefaultModel(
  workspace: LoadedWorkspace,
  fileProblems: number,
  aliases: readonly AliasProvider[],
): { missingDefaultModel?: string } {
  const name = filesOf(workspace, "workspace")[0]?.value.defaults.model ?? "default";
  if (fileProblems > 0 || name.includes("/") || resolveModel(workspace, null, name) !== undefined) {
    return {};
  }
  const onDefault = filesOf(workspace, "agent").some(
    (agent) =>
      agent.value.model === undefined &&
      !startsAProgram(agent.value.harness) &&
      (agent.hub === null || callModelName(definitionsOf(workspace, agent.hub), {}) === name),
  );
  return aliases.length === 0 || onDefault ? { missingDefaultModel: name } : {};
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
    return { ...named, runs: "without-a-key", testModel: true };
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
 * the default address of the provider's type. A `baseUrl` without a host
 * (`localhost:11434` reads as a scheme) is shown as written, never as an
 * empty address (HAL-14260).
 */
export function providerAddress(provider: Provider): string | undefined {
  if (provider.baseUrl !== undefined) {
    return new URL(provider.baseUrl).host || provider.baseUrl;
  }
  return defaultLocalAddress(provider.type);
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

/**
 * The aliases, then each `provider/model` an agent of the root or a hub
 * names as its `model`, or a method's, whose provider no alias uses, each
 * once, in the agents' order. Its name stands where an alias would, so the
 * Models line says "claude/claude-sonnet-5-5 needs an API key for Anthropic.".
 */
function withDirectModels(
  aliases: readonly AliasProvider[],
  workspace: LoadedWorkspace,
): AliasProvider[] {
  const all = [...aliases];
  const providers = new Set(aliases.map((alias) => alias.provider));
  const names = new Set<string>();
  for (const { hub, value: agent } of filesOf(workspace, "agent")) {
    const models = [agent.model, ...Object.values(agent.methods).map((method) => method.model)];
    for (const name of models) {
      if (name === undefined) continue;
      const target = resolveModel(workspace, hub, name);
      // An alias is listed already; a name no alias or provider resolves isn't a provider's.
      if (target === undefined || target.alias !== undefined) continue;
      if (providers.has(target.provider) || names.has(name)) continue;
      names.add(name);
      all.push({ alias: name, provider: target.provider });
    }
  }
  return all;
}

/** The file of every provider the aliases use, in the order they're first used, that has one. */
function usedProviderFiles(
  workspace: LoadedWorkspace,
  aliases: readonly AliasProvider[],
): Provider[] {
  const files = new Map(filesOf(workspace, "provider").map((file) => [file.value.id, file.value]));
  const used = [...new Set(aliases.map((alias) => alias.provider))];
  return used.flatMap((id) => files.get(id) ?? []);
}

/**
 * The secrets a run here needs that the Models line doesn't check, each
 * once, with what uses it (HAL-14269):
 *
 * - **Connectors** an agent can use (see {@link usedConnectors}): an HTTP
 *   connector's `secret` and a program's `secretEnv`. One no agent uses
 *   never needs its secret, so it isn't checked.
 * - **Providers** the aliases use whose `secret` the Models line doesn't ask
 *   about, such as the test model or a server on this computer.
 * - **Routines** with a webhook trigger that are enabled: the `secret` that
 *   signs each request. Without it, the host refuses every request (C340).
 *
 * Names are compared as the `Secrets` port compares them ({@link secretKey}),
 * so `files-token` and `FILES_TOKEN` are one secret, shown as first written.
 * A secret the Models line checks as a cloud provider's key is left out,
 * whatever else uses it, so no secret is named twice.
 */
function usedSecrets(workspace: LoadedWorkspace, providerFiles: readonly Provider[]): UsedSecret[] {
  const checkedByModels = new Set(
    providerFiles.flatMap((provider) => {
      const shown = doctorProvider(provider);
      return shown?.runs === "with-a-key" ? [comparedName(shown.secret)] : [];
    }),
  );
  const byKey = new Map<string, UsedSecret>();
  const add = (secret: string, user: UsedSecret["usedBy"][number]) => {
    const key = comparedName(secret);
    if (checkedByModels.has(key)) return;
    const entry = byKey.get(key) ?? { secret, usedBy: [] };
    if (!entry.usedBy.some((known) => known.kind === user.kind && known.id === user.id)) {
      entry.usedBy.push(user);
    }
    byKey.set(key, entry);
  };
  for (const connector of usedConnectors(workspace)) {
    for (const secret of connectorSecrets(connector)) {
      add(secret, { kind: "connector", id: connector.id });
    }
  }
  for (const provider of providerFiles) {
    if (provider.secret !== undefined) add(provider.secret, { kind: "provider", id: provider.id });
  }
  for (const { value: routine } of filesOf(workspace, "routine")) {
    if (routine.enabled && "webhook" in routine.trigger) {
      add(routine.trigger.webhook.secret, { kind: "routine", id: routine.id });
    }
  }
  return [...byKey.values()];
}

/**
 * A secret's name as the `Secrets` port compares it. A name the port refuses
 * is kept as written: the store refuses it too, and `doctor` says so.
 */
export function comparedName(secret: string): string {
  return isSecretName(secret) ? secretKey(secret) : secret;
}

/**
 * The connectors an agent of the workspace can use, each once: those it
 * names in `connectors` that its hub sees, the hub's own or a shared one
 * its `uses.connectors` allows, as a run loads them. An agent at the
 * workspace's root sees the shared ones.
 */
function usedConnectors(workspace: LoadedWorkspace): Connector[] {
  const shared = Object.fromEntries(
    filesOf(workspace, "connector")
      .filter((file) => file.hub === null)
      .map((file) => [file.value.id, file.value]),
  );
  const used = new Set<Connector>();
  for (const agent of filesOf(workspace, "agent")) {
    const seen = agent.hub === null ? shared : definitionsOf(workspace, agent.hub).connectors;
    for (const id of agent.value.connectors) {
      const connector = seen[id];
      if (connector !== undefined) used.add(connector);
    }
  }
  return [...used];
}

/**
 * The secrets a connector reads when it starts, each once. A Google
 * connector's `secret` names none, and a local integration or a plugin gets
 * its secrets from its permission sheet, so they have none here.
 */
function connectorSecrets(connector: Connector): string[] {
  const { transport } = connector;
  if ("http" in transport) return connector.secret === undefined ? [] : [connector.secret];
  if ("stdio" in transport) return [...new Set(Object.values(transport.stdio.secretEnv ?? {}))];
  return [];
}
