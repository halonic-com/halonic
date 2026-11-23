import type { ModelAlias } from "@halonicjs/format";
import type { CatalogProblem } from "./catalog.ts";
import { aliasStatuses, type RouterAliasFields } from "./router-extension.ts";

/** The provider an `open-pinned` alias goes through: the host pin is OpenRouter's routing field. */
const pinningProvider = "openrouter";

/** The provider of every `anthropic` alias. */
const anthropicProvider = "anthropic";

/**
 * The rules across `providers.yaml` and `providers.router.yaml`: each file
 * is valid on its own, but together they must describe the same aliases,
 * price every one, pin every open model and fall back only within the same
 * class and model (Q3).
 */
export function crossCheck(
  aliases: Readonly<Record<string, ModelAlias>>,
  fields: Readonly<Record<string, RouterAliasFields>>,
): CatalogProblem[] {
  const problems: CatalogProblem[] = [];
  for (const name of Object.keys(fields)) {
    if (aliases[name] === undefined) {
      problems.push(routerProblem(name, `There is no alias "${name}" in providers.yaml.`));
    }
  }
  for (const [name, alias] of Object.entries(aliases)) {
    const extension = fields[name];
    if (extension === undefined) {
      problems.push(
        modelsProblem(
          name,
          `Add "${name}" to providers.router.yaml with its data class and status.`,
        ),
      );
      continue;
    }
    problems.push(...priceProblems(name, alias), ...pinProblems(name, alias, extension));
    problems.push(...alias.fallback.flatMap((to) => fallbackProblem(name, to, aliases, fields)));
  }
  return problems;
}

/** Every alias needs a price, or cost per pass can't be compared (Q4). */
function priceProblems(name: string, alias: ModelAlias): CatalogProblem[] {
  if (alias.price !== undefined) {
    return [];
  }
  return [modelsProblem(name, `Give "${name}" its list price, so its runs have a cost.`, "price")];
}

/**
 * An `open-pinned` alias goes through OpenRouter with exactly one pinned host;
 * an `anthropic` alias goes to Anthropic with none. The pin lives only in the
 * router's file: an alias that sets OpenRouter's routing itself would be a
 * second source the adapter could disagree with.
 */
function pinProblems(
  name: string,
  alias: ModelAlias,
  extension: RouterAliasFields,
): CatalogProblem[] {
  const problems: CatalogProblem[] = [];
  if (alias.params.extra?.["provider"] !== undefined) {
    problems.push(
      modelsProblem(
        name,
        `Remove params.extra.provider from "${name}": the pinned host comes from providers.router.yaml.`,
        "params.extra.provider",
      ),
    );
  }
  if (extension.dataClass === "open-pinned") {
    if (alias.provider !== pinningProvider) {
      problems.push(
        modelsProblem(name, `An open-pinned alias goes through ${pinningProvider}.`, "provider"),
      );
    }
    if (extension.pinnedHost === undefined) {
      problems.push(routerProblem(name, `Pin "${name}" to one host with pinnedHost.`));
    }
    return problems;
  }
  if (alias.provider !== anthropicProvider) {
    problems.push(
      modelsProblem(name, `An anthropic alias goes to ${anthropicProvider}.`, "provider"),
    );
  }
  if (extension.pinnedHost !== undefined) {
    problems.push(routerProblem(name, `Only an open-pinned alias has a pinnedHost.`, "pinnedHost"));
  }
  return problems;
}

/**
 * Within a run, an alias may fall back only to an alias with the same data
 * class and the same model (Q3), and never to one the router trusts less: a
 * change across classes or models is a new run with a new router decision.
 */
function fallbackProblem(
  name: string,
  to: string,
  aliases: Readonly<Record<string, ModelAlias>>,
  fields: Readonly<Record<string, RouterAliasFields>>,
): CatalogProblem[] {
  const target = aliases[to];
  const targetFields = fields[to];
  const from = aliases[name];
  const fromFields = fields[name];
  if (target === undefined || targetFields === undefined) {
    return [modelsProblem(name, `The fallback "${to}" isn't an alias in the catalog.`, "fallback")];
  }
  if (from === undefined || fromFields === undefined) {
    return [];
  }
  if (targetFields.dataClass !== fromFields.dataClass || target.model !== from.model) {
    return [
      modelsProblem(
        name,
        `"${name}" may fall back only to an alias with the same data class and model, not "${to}".`,
        "fallback",
      ),
    ];
  }
  if (trustOf(targetFields) > trustOf(fromFields)) {
    return [
      modelsProblem(
        name,
        `"${name}" is ${fromFields.status} and may not fall back to "${to}", which is ${targetFields.status}.`,
        "fallback",
      ),
    ];
  }
  return [];
}

/** Lower is more trusted: `approved` is 0. */
function trustOf(fields: RouterAliasFields): number {
  return aliasStatuses.indexOf(fields.status);
}

function modelsProblem(name: string, message: string, key?: string): CatalogProblem {
  const path = key === undefined ? `aliases.${name}` : `aliases.${name}.${key}`;
  return { file: "providers.yaml", path, message };
}

function routerProblem(name: string, message: string, key?: string): CatalogProblem {
  const path = key === undefined ? `aliases.${name}` : `aliases.${name}.${key}`;
  return { file: "providers.router.yaml", path, message };
}
