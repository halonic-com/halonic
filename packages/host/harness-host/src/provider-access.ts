// Which access a harness agent's bridge gets to its model provider
// (requirement `harness-host.provider-access`, HAL-12784). A pure function of
// the agent's harness, where it runs and the workspace's provider files, so
// the CLI and the Studio decide the same way. It reads no secret: the host
// checks that the chosen secret holds a value before the bridge opens.

import type { ProgramHarness } from "@halonicjs/engine";
import type { BridgeProvider } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";

/** The provider each harness program calls: Claude Code calls Anthropic, Codex calls OpenAI. */
const providerOfHarness: Record<ProgramHarness, BridgeProvider> = {
  "claude-code": "anthropic",
  codex: "openai",
};

/** Each provider's name as people know it, for messages. */
const providerNames: Record<BridgeProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

/**
 * The provider file types an alias may point a harness to on each route: an
 * `openai-compatible` address speaks OpenAI's Responses API too, so Codex can call it.
 */
const aliasTypes: Record<BridgeProvider, readonly string[]> = {
  anthropic: ["anthropic"],
  openai: ["openai", "openai-compatible"],
};

/** What the rules read of a provider file (`providers/<id>.yaml`). */
export interface AccessProviderFile {
  readonly id: string;
  readonly type: string;
  readonly secret?: string | undefined;
  readonly baseUrl?: string | undefined;
}

/** What {@link providerAccessOf} decides from. */
export interface ProviderAccessInput {
  readonly harness: ProgramHarness;
  /** Where the agent runs, as the placement policy answered for this call. */
  readonly runsOn: "sandbox" | "this-computer";
  /** The workspace's provider files. */
  readonly providers: readonly AccessProviderFile[];
  /**
   * The provider id the agent's `model` points to, once its alias is
   * resolved; `undefined` when the file names no model or the name resolves to none.
   */
  readonly modelProvider?: string;
  /**
   * The provider id the agent's `model` resolves to when that name is an
   * alias of its hub's models; left out for no model or a `provider/model` name.
   * The engine then asks the program for the alias's model on every call,
   * which the program's own sign-in can't serve.
   *
   * Set it only after the built-in loop's key check (`cli.harness-model-access`:
   * trust, the key's allowed addresses, the harness's route) has passed for the
   * alias: rule 0 gives the key on this computer too and checks no trust itself.
   */
  readonly aliasProvider?: string;
}

/** The access the bridge gets to the provider the agent's harness calls. */
export type ProviderAccessChoice =
  | {
      readonly kind: "sign-in";
      readonly provider: BridgeProvider;
      /**
       * Why: `this-computer`, where the program's own sign-in works; or
       * `no-keyed-provider`, a sandboxed agent in a workspace with no provider
       * of that type with a `secret`, which then runs signed out.
       */
      readonly reason: "this-computer" | "no-keyed-provider";
    }
  | {
      readonly kind: "key";
      readonly provider: BridgeProvider;
      /** The provider file the key comes from. */
      readonly providerId: string;
      /** The name of the secret that holds the key, never its value. */
      readonly secret: string;
      /** The file's `baseUrl`; left out, the calls and the key go to the type's own address. */
      readonly baseUrl?: string;
    };

/**
 * The access one harness agent's bridge gets:
 *
 * 0. For an alias, wherever the agent runs, the key of the alias's provider
 *    when it is of a type the harness calls and has a `secret`.
 * 1. On this computer, the program's own sign-in, which works there and
 *    spends nothing.
 * 2. In the sandbox, the key of a provider of the harness's type that has a
 *    `secret`: the one the agent's `model` points to, else the only one. A
 *    model pointing to such a provider with no `secret` never falls back to
 *    another one's key.
 * 3. In the sandbox with no such provider, the program's own sign-in, as
 *    before: the host says how to add one.
 *
 * @throws KindedError `invalid_input` when the workspace has several such
 *   providers and the agent's model points to none of them; the message names them
 * @throws KindedError `invalid_input` when the agent's model points to a
 *   provider of that type with no `secret` while another one has one: the
 *   key of a provider the agent isn't tied to is never spent
 *
 * @example
 * providerAccessOf({ harness: "claude-code", runsOn: "sandbox", providers: [{ id: "claude", type: "anthropic", secret: "anthropic-key" }] });
 * // { kind: "key", provider: "anthropic", providerId: "claude", secret: "anthropic-key" }
 */
export function providerAccessOf(input: ProviderAccessInput): ProviderAccessChoice {
  const provider = providerOfHarness[input.harness];
  const aliasKey = aliasKeyOf(input, provider);
  if (aliasKey !== undefined) return aliasKey;
  if (input.runsOn === "this-computer") {
    return { kind: "sign-in", provider, reason: "this-computer" };
  }
  const keyed = input.providers.filter(
    (file): file is AccessProviderFile & { secret: string } =>
      file.type === provider && file.secret !== undefined,
  );
  const pointedTo = input.providers.find(
    (file) => file.type === provider && file.id === input.modelProvider,
  );
  if (pointedTo !== undefined && pointedTo.secret === undefined && keyed.length > 0) {
    // Another provider's key would go to an address and allow-list the
    // workspace never tied to this agent, so the run stops instead.
    throw new KindedError(
      "invalid_input",
      `The agent's model points to the ${providerNames[provider]} provider "${pointedTo.id}", which names no secret, so the sandboxed agent has no key to call it with. Add a secret to providers/${pointedTo.id}.yaml and save it with halonic secret set, or point the model to a provider that has one.`,
    );
  }
  const chosen =
    keyed.find((file) => file.id === input.modelProvider) ??
    (keyed.length === 1 ? keyed[0] : undefined);
  if (chosen !== undefined) {
    return {
      kind: "key",
      provider,
      providerId: chosen.id,
      secret: chosen.secret,
      ...(chosen.baseUrl === undefined ? {} : { baseUrl: chosen.baseUrl }),
    };
  }
  if (keyed.length === 0) {
    return { kind: "sign-in", provider, reason: "no-keyed-provider" };
  }
  const name = providerNames[provider];
  const ids = keyed.map((file) => file.id).join(", ");
  throw new KindedError(
    "invalid_input",
    `The workspace has several ${name} providers with a key (${ids}), and the agent's model points to none of them, so Halonic doesn't know whose key the sandboxed agent may spend. Set the agent's model to one of them, such as "${keyed[0]?.id}/<model>".`,
  );
}

/**
 * Rule 0: the key of the alias's provider, when the agent's `model` is an
 * alias of a provider of a type the harness calls that has a `secret`, else
 * `undefined`, so the other rules decide.
 */
function aliasKeyOf(
  input: ProviderAccessInput,
  provider: BridgeProvider,
): ProviderAccessChoice | undefined {
  if (input.aliasProvider === undefined) return undefined;
  const file = input.providers.find((candidate) => candidate.id === input.aliasProvider);
  if (file?.secret === undefined || !aliasTypes[provider].includes(file.type)) return undefined;
  return {
    kind: "key",
    provider,
    providerId: file.id,
    secret: file.secret,
    ...(file.baseUrl === undefined ? {} : { baseUrl: file.baseUrl }),
  };
}
