import type { ModelAlias } from "@halonicjs/format";
import { filesOf, type LoadedWorkspace } from "./load-workspace.ts";

/** One model at a provider, as plain data: what an alias or a `provider/model` name points to. */
export interface ModelTarget {
  /** The provider's id, its file name in `providers/`. */
  readonly provider: string;
  /** The model's name at that provider. */
  readonly model: string;
  /** The tuning the alias sets; `{}` for a `provider/model` name. */
  readonly params: ModelAlias["params"];
  /** What the model costs, when the alias says. */
  readonly price?: ModelAlias["price"];
  /** The alias it came from; left out for a `provider/model` name. */
  readonly alias?: string;
}

/** A model a name resolved to, with the models its alias falls back to. */
export interface ResolvedModelTarget extends ModelTarget {
  /**
   * The targets of the alias's own `fallback` entries, in order. Only this
   * level is resolved, as the engine tries only this level. A fallback no
   * alias has is left out: `loadWorkspace` reports it.
   */
  readonly fallback: readonly ModelTarget[];
}

/**
 * The model aliases a hub can use, by name: those of `models.yaml`, and over
 * them the hub's own from its `hub.yaml`. `null` gives the root's, which
 * are `models.yaml`'s only. A file that didn't parse gives none.
 */
export function modelAliases(
  workspace: LoadedWorkspace,
  hubId: string | null,
): Map<string, ModelAlias> {
  const aliases = new Map<string, ModelAlias>();
  for (const models of filesOf(workspace, "models")) {
    for (const [name, alias] of Object.entries(models.value.aliases)) {
      aliases.set(name, alias);
    }
  }
  if (hubId !== null) {
    for (const hub of filesOf(workspace, "hub").filter((file) => file.hub === hubId)) {
      for (const [name, alias] of Object.entries(hub.value.models)) {
        aliases.set(name, alias);
      }
    }
  }
  return aliases;
}

/**
 * Resolves a model setting, such as an agent's `model`, to a provider and a
 * model. A name with a `/` names the model directly (`openai/gpt-5`: the
 * part before the first `/` is the provider); any other name is an alias
 * the hub can use, see {@link modelAliases}.
 *
 * @param workspace - the loaded workspace
 * @param hubId - the hub the setting is in; `null` at the root
 * @param name - an alias such as "smart", or `provider/model`
 * @returns the target and its fallbacks, or `undefined` for an alias the hub doesn't have
 *
 * @example
 * resolveModel(workspace, "billing", "smart");
 * // { provider: "anthropic", model: "claude-opus-5-5", params: {}, alias: "smart", fallback: [] }
 */
export function resolveModel(
  workspace: LoadedWorkspace,
  hubId: string | null,
  name: string,
): ResolvedModelTarget | undefined {
  const slash = name.indexOf("/");
  if (slash !== -1) {
    return {
      provider: name.slice(0, slash),
      model: name.slice(slash + 1),
      params: {},
      fallback: [],
    };
  }
  const aliases = modelAliases(workspace, hubId);
  const alias = aliases.get(name);
  return alias === undefined ? undefined : resolvedAlias(aliases, name, alias);
}

/** One alias with its fallbacks, from the aliases a hub can use. */
export function resolvedAlias(
  aliases: ReadonlyMap<string, ModelAlias>,
  name: string,
  alias: ModelAlias,
): ResolvedModelTarget {
  const fallback = alias.fallback.flatMap((fallbackName) => {
    const target = aliases.get(fallbackName);
    return target === undefined ? [] : [targetOf(fallbackName, target)];
  });
  return { ...targetOf(name, alias), fallback };
}

function targetOf(name: string, alias: ModelAlias): ModelTarget {
  const target = {
    provider: alias.provider,
    model: alias.model,
    params: alias.params,
    alias: name,
  };
  return alias.price === undefined ? target : { ...target, price: alias.price };
}
