// What a harness agent's bridge serves when the agent file's `model` is an
// alias of the workspace's models (HAL-12488): the provider's key, at the
// provider file's address, on the bridge route that speaks its API, and the
// alias's price. The same check as the built-in loop's model calls runs
// first, so the CLI and the Studio decide where a key may go the same way.

import type { BridgeProvider, KeyOrigins, ModelPrice } from "@halonicjs/ports";
import {
  definitionsOf,
  type LoadedWorkspace,
  type ModelTarget,
  modelPrice,
  resolveModel,
} from "@halonicjs/workspace";
import { modelTexts } from "./model-texts.ts";
import { requireMayCall } from "./workspace-model-resolver.ts";
import { WorkspaceModelError } from "./workspace-providers.ts";

/**
 * The bridge route of each provider type a harness program can call: Claude
 * Code speaks Anthropic's Messages API, Codex OpenAI's Responses API. Any
 * other type has neither.
 */
const bridgeRoutes: ReadonlyMap<string, BridgeProvider> = new Map([
  ["anthropic", "anthropic"],
  ["openai", "openai"],
  ["openai-compatible", "openai"],
]);

/** The bridge route each harness's program calls, and the name a person reads for it. */
const harnessRoutes: ReadonlyMap<string, { route: BridgeProvider; name: string }> = new Map([
  ["claude-code", { route: "anthropic", name: "Claude Code" }],
  ["codex", { route: "openai", name: "Codex" }],
]);

/** A harness agent's keyed provider, from its model alias. */
export interface HarnessModelAccess {
  /** The bridge route whose API the provider speaks. */
  readonly route: BridgeProvider;
  /** The provider file's id, which the run log names as the calls' provider. */
  readonly providerId: string;
  /** The name the provider's key is stored under. */
  readonly secret: string;
  /** The provider file's `baseUrl`; left out, the calls go to the route's own host. */
  readonly baseUrl?: string;
  /** The provider's own id for the model, such as `glm-5.3`. */
  readonly model: string;
  /** The alias's price; left out when it has none. */
  readonly price?: ModelPrice;
}

/** What {@link harnessModelAccess} checks a key against. */
export interface HarnessAccessChecks {
  /** Whether the workspace is trusted on this computer, as the model resolver asks it. */
  readonly isTrusted: () => boolean | Promise<boolean>;
  /** The origins each stored key may be sent to, as the model resolver reads them. */
  readonly keyOrigins: KeyOrigins;
}

/**
 * The provider's own model id for an alias of the hub, or `undefined` when
 * `name` is no alias there (requirement `cli.harness-model-access`). A name
 * with a `/` is no alias. Reads the files only, so it checks no key.
 *
 * @throws RangeError when the workspace has no such hub
 *
 * @example
 * harnessProviderModel(workspace, "support", "open-coder-agent"); // "glm-5.3"
 * harnessProviderModel(workspace, "support", "sonnet"); // undefined
 */
export function harnessProviderModel(
  workspace: LoadedWorkspace,
  hubId: string,
  name: string,
): string | undefined {
  return aliasTarget(workspace, hubId, name)?.model;
}

/**
 * The keyed provider of a harness agent whose file's `model` is an alias of
 * its hub, or `undefined` when it is no alias, so the program signs in
 * itself (requirement `cli.harness-model-access`). The provider must speak
 * the API of the agent's `harness`: Claude Code Anthropic's, Codex OpenAI's. Only the alias's own
 * target counts: a harness program calls one provider, so its fallbacks
 * aren't tried.
 *
 * Before the key is named, the check the built-in loop's calls get runs on
 * the provider file: a key goes to an address other than its type's own only
 * in a trusted workspace, and only to an origin its list allows; and a real
 * provider needs a trusted workspace at all.
 *
 * @throws {WorkspaceModelError} `no-provider` when the alias names a provider
 *   the workspace doesn't have; `not-for-harness` when its type has no bridge
 *   route, or not the one the harness calls, or it names no secret; or what the key check throws
 *   (`untrusted-provider-address`, `key-origin-not-allowed`, `untrusted-workspace`)
 * @throws RangeError when the workspace has no such hub
 *
 * @example
 * await harnessModelAccess(workspace, "support", "open-coder-agent", "claude-code", checks);
 * // { route: "anthropic", providerId: "zai", secret: "zai-key",
 * //   baseUrl: "https://api.z.ai/api/anthropic", model: "glm-5.3", price: { … } }
 */
export async function harnessModelAccess(
  workspace: LoadedWorkspace,
  hubId: string,
  name: string,
  harness: string,
  checks: HarnessAccessChecks,
): Promise<HarnessModelAccess | undefined> {
  const target = aliasTarget(workspace, hubId, name);
  if (target === undefined) return undefined;
  const file = definitionsOf(workspace, hubId).providers[target.provider];
  if (file === undefined) {
    throw new WorkspaceModelError(
      "no-provider",
      modelTexts.noProvider(target.provider, name),
      modelTexts.noProviderFix(target.provider),
    );
  }
  const route = bridgeRoutes.get(file.type);
  if (route === undefined) {
    throw new WorkspaceModelError(
      "not-for-harness",
      modelTexts.harnessType(file.id, file.type),
      modelTexts.harnessTypeFix(file.id),
    );
  }
  requireHarnessRoute(harness, route, file.id, file.type);
  if (file.secret === undefined) {
    throw new WorkspaceModelError(
      "not-for-harness",
      modelTexts.harnessKey(file.id),
      modelTexts.harnessKeyFix(file.id),
    );
  }
  await requireMayCall(file, {
    trusted: await checks.isTrusted(),
    keyOrigins: checks.keyOrigins,
  });
  return {
    route,
    providerId: file.id,
    secret: file.secret,
    model: target.model,
    ...(file.baseUrl === undefined ? {} : { baseUrl: file.baseUrl }),
    ...(target.price === undefined ? {} : { price: modelPrice(target.price) }),
  };
}

/**
 * Fails unless the harness's program calls `route`, so a key never goes to a
 * bridge route the program won't use, and the run fails before it starts.
 */
function requireHarnessRoute(
  harness: string,
  route: BridgeProvider,
  providerId: string,
  type: string,
): void {
  const program = harnessRoutes.get(harness);
  if (program?.route === route) return;
  throw new WorkspaceModelError(
    "not-for-harness",
    modelTexts.harnessRoute(program?.name ?? harness, providerId, type),
    modelTexts.harnessRouteFix(providerId),
  );
}

/** The alias's own target, or `undefined` for a name that is no alias of the hub. */
function aliasTarget(
  workspace: LoadedWorkspace,
  hubId: string,
  name: string,
): ModelTarget | undefined {
  if (name.includes("/")) return undefined;
  return resolveModel(workspace, hubId, name);
}
